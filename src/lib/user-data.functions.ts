// Server fns backing profile, leaderboard, activity, and pack purchase records.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { normalizeWallet, walletToProfileId } from "@/lib/profile";

/* -------------------- Profile / username -------------------- */

const ProfileUpsertInput = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  username: z.string().min(1).max(32).optional(),
  xp: z.number().int().nonnegative().optional(),
  packs_shredded: z.number().int().nonnegative().optional(),
  level: z.number().int().positive().optional(),
});

const SHRED_PACKS = ["starter", "mystery", "alpha", "legendary", "explorer"] as const;
const STARTER_PACK_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export const upsertProfile = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ProfileUpsertInput.parse(raw))
  .handler(async ({ data }) => {
    const normalizedWallet = normalizeWallet(data.wallet) ?? data.wallet.toLowerCase();
    const { getSupabasePublic } = await import("./supabase-public.server");
    const supabasePublic = getSupabasePublic();
    const { error } = await supabasePublic.rpc("upsert_wallet_profile", {
      _wallet: normalizedWallet,
      _username: data.username ?? null,
      _xp: data.xp ?? null,
      _packs_shredded: data.packs_shredded ?? null,
      _level: data.level ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).parse(raw ?? {}))
  .handler(async ({ data }) => {
    const { getSupabasePublic } = await import("./supabase-public.server");
    const supabasePublic = getSupabasePublic();
    const profileId = walletToProfileId(data.wallet);
    const { data: row, error } = await supabaseAdmin
    const { data: row, error } = await supabasePublic
      .from("profiles").select("*").eq("id", profileId).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

/* -------------------- Discoveries / activity -------------------- */

const DiscoveryInput = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  packId: z.enum(SHRED_PACKS),
  username: z.string().min(1).max(32).optional(),
  items: z.array(z.object({
    kind: z.enum(["USDM", "USDT", "XP", "CARD", "FACT"]),
    title: z.string(),
    sub: z.string(),
    rarity: z.enum(["Common", "Rare", "Epic", "Legendary"]).optional(),
    amount: z.number().optional(), // USDM/USDT amount or XP points
  })).min(1).max(8),
});

export const recordShred = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => DiscoveryInput.parse(raw))
  .handler(async ({ data }) => {
    console.info("[shred] ✓ Reward generated", {
      wallet: data.wallet,
      packId: data.packId,
      itemCount: data.items.length,
      usdmAmount: data.items
        .filter((i) => i.kind === "USDM")
        .reduce((sum, i) => sum + Number(i.amount ?? 0), 0),
    });
    console.info("[shred] ✓ Saving reward to database", {
      packId: data.packId,
      wallet: data.wallet,
    });

    const { getSupabasePublic } = await import("./supabase-public.server");
    const supabasePublic = getSupabasePublic();
    const normalizedWallet = data.wallet.toLowerCase();
    const xpGain = data.items
      .filter((i) => i.kind === "XP" && typeof i.amount === "number")
      .reduce((s, i) => s + (i.amount ?? 0), 0);
    const items = data.items.map((i) => ({
      kind: i.kind,
      title: i.title,
      sub: i.sub,
      rarity: i.rarity ?? "Common",
      amount: i.amount ?? null,
    }));
    const { data: result, error } = await supabasePublic.rpc("record_wallet_shred", {
      _wallet: normalizedWallet,
      _username: data.username ?? null,
      _pack_id: data.packId,
      _items: items,
    });
    if (error) {
      console.error("[shred] ✗ Discovery/reward insert failed", {
        error: error.message,
        details: error,
        items,
      });
      throw new Error(`Discovery/reward insert failed: ${error.message}`);
    }

    console.info("[shred] ✓ Database persistence complete", {
      packId: data.packId,
    });

    return result ?? { ok: true, xp: xpGain };
  });

export const getStarterCooldown = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).parse(raw ?? {}))
  .handler(async ({ data }) => {
    const { getSupabasePublic } = await import("./supabase-public.server");
    const supabasePublic = getSupabasePublic();
    const STARTER_PACK_COOLDOWN_MS = 12 * 60 * 60 * 1000;
    const profileId = walletToProfileId(data.wallet);
    const cutoff = new Date(Date.now() - STARTER_PACK_COOLDOWN_MS).toISOString();
    const { data: recentStarter, error } = await supabasePublic
      .from("discoveries")
      .select("created_at")
      .eq("user_id", profileId)
      .eq("pack_id", "starter")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!recentStarter?.created_at) return { active: false, until: null as string | null };
    return {
      active: true,
      until: new Date(new Date(recentStarter.created_at).getTime() + STARTER_PACK_COOLDOWN_MS).toISOString(),
    };
  });

export const listMyDiscoveries = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).parse(raw ?? {}))
  .handler(async ({ data }) => {
    const { getSupabasePublic } = await import("./supabase-public.server");
    const supabasePublic = getSupabasePublic();
    const profileId = walletToProfileId(data.wallet);
    const { data: rows, error } = await supabasePublic
      .from("discoveries")
      .select("*")
      .eq("user_id", profileId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getStatsAndFeed = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({}).parse(raw ?? {}))
  .handler(async () => {
    const { getSupabasePublic } = await import("./supabase-public.server");
    const supabasePublic = getSupabasePublic();

    const [{ data: packRows, error: packError }, { data: globalRow, error: globalError }, { data: feedRows, error: feedError }] = await Promise.all([
      supabasePublic.from("pack_stats").select("pack_id,owners,shreds,drops").order("pack_id"),
      supabasePublic.from("global_stats").select("shredders,packs_shredded,discoveries,rewards_usdm").eq("id", 1).maybeSingle(),
      supabasePublic.from("live_feed").select("username,wallet,pack_id,kind,text,amount").order("created_at", { ascending: false }).limit(30),
    ]);

    if (packError) throw new Error(packError.message);
    if (globalError) throw new Error(globalError.message);
    if (feedError) throw new Error(feedError.message);

    const packStats = (packRows ?? []).reduce<Record<string, { owners: number; shreds: number; drops: number }>>((acc, row) => {
      acc[row.pack_id] = {
        owners: Number(row.owners ?? 0),
        shreds: Number(row.shreds ?? 0),
        drops: Number(row.drops ?? 0),
      };
      return acc;
    }, {});

    const globalStats = {
      shredders: Number(globalRow?.shredders ?? 0),
      packs_shredded: Number(globalRow?.packs_shredded ?? 0),
      discoveries: Number(globalRow?.discoveries ?? 0),
      rewards_usdm: Number(globalRow?.rewards_usdm ?? 0),
    };

    return {
      packStats,
      globalStats,
      liveFeed: (feedRows ?? []).map((row) => ({
        username: row.username,
        wallet: row.wallet,
        pack_id: row.pack_id,
        kind: row.kind,
        text: row.text,
        amount: row.amount,
      })),
    };
  });

export const recordPackPurchase = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({
    wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    packId: z.enum(SHRED_PACKS),
    orderId: z.string().min(1).max(128),
    txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
    priceUsdm: z.number().nonnegative(),
  }).parse(raw))
  .handler(async ({ data }) => {
    const { getSupabasePublic } = await import("./supabase-public.server");
    const supabasePublic = getSupabasePublic();
    const { error } = await supabasePublic.rpc("record_wallet_pack_purchase", {
      _wallet: data.wallet.toLowerCase(),
      _pack_id: data.packId,
      _order_id: data.orderId,
      _tx_hash: data.txHash ?? null,
      _price_usdm: data.priceUsdm,
    });
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------- Leaderboard -------------------- */

export const getLeaderboard = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({
    range: z.enum(["daily", "weekly", "monthly", "all"]).default("weekly"),
  }).parse(raw ?? {}))
  .handler(async ({ data }) => {
    const { getSupabasePublic } = await import("./supabase-public.server");
    const supabasePublic = getSupabasePublic();
    const { data: rows, error } = await supabasePublic
      .from("profiles")
      .select("username, wallet, xp, packs_shredded")
      .order("xp", { ascending: false })
      .limit(50);
    if (error) return [];
    return (rows ?? []).map((row) => ({ ...row, range: data.range })) as Array<{
      username: string | null;
      wallet: string | null;
      xp: number;
      packs_shredded: number;
      range: string;
    }>;
  });
