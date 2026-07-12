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
    const { getSupabaseAdmin } = await import("./supabase-admin.server");
    const supabaseAdmin = getSupabaseAdmin();
    const normalizedWallet = normalizeWallet(data.wallet) ?? data.wallet.toLowerCase();
    const profileId = walletToProfileId(normalizedWallet);
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from("profiles")
      .select("id, username, xp, packs_shredded, level")
      .eq("id", profileId)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);

    const nextXp = typeof data.xp === "number" ? data.xp : Number(existing?.xp ?? 0);
    const nextPacksShredded = typeof data.packs_shredded === "number" ? data.packs_shredded : Number(existing?.packs_shredded ?? 0);
    const nextLevel = typeof data.level === "number"
      ? data.level
      : Math.max(1, Math.floor(nextXp / 500) + 1);

    const payload = {
      id: profileId,
      wallet: normalizedWallet,
      username: data.username ?? existing?.username ?? null,
      xp: nextXp,
      packs_shredded: nextPacksShredded,
      level: nextLevel,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin.from("profiles").upsert(payload, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).parse(raw ?? {}))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("./supabase-admin.server");
    const supabaseAdmin = getSupabaseAdmin();
    const profileId = walletToProfileId(data.wallet);
    const { data: row, error } = await supabaseAdmin
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

    const { getSupabaseAdmin } = await import("./supabase-admin.server");
    const supabaseAdmin = getSupabaseAdmin();
    const normalizedWallet = data.wallet.toLowerCase();
    const profileId = walletToProfileId(normalizedWallet);
    const xpGain = data.items
      .filter((i) => i.kind === "XP" && typeof i.amount === "number")
      .reduce((s, i) => s + (i.amount ?? 0), 0);
    if (data.packId === "starter") {
      const STARTER_PACK_COOLDOWN_MS = 12 * 60 * 60 * 1000;
      const cutoff = new Date(Date.now() - STARTER_PACK_COOLDOWN_MS).toISOString();
      const { data: recentStarter, error: cooldownError } = await supabaseAdmin
        .from("discoveries")
        .select("created_at")
        .eq("user_id", profileId)
        .eq("pack_id", "starter")
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cooldownError) {
        console.error("[shred] ✗ Starter cooldown lookup failed", {
          error: cooldownError.message,
          details: cooldownError,
        });
        throw new Error(`Starter cooldown lookup failed: ${cooldownError.message}`);
      }
      if (recentStarter?.created_at) {
        const availableAt = new Date(new Date(recentStarter.created_at).getTime() + STARTER_PACK_COOLDOWN_MS).toISOString();
        throw new Error(`Starter Pack cooldown active until ${availableAt}`);
      }
    }

    const [{ count: priorPackCount, error: priorPackError }, { count: priorUserCount, error: priorUserError }] = await Promise.all([
      supabaseAdmin
        .from("discoveries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profileId)
        .eq("pack_id", data.packId),
      supabaseAdmin
        .from("discoveries")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profileId),
    ]);
    if (priorPackError) {
      console.error("[shred] ✗ Prior pack discovery count failed", {
        error: priorPackError.message,
        details: priorPackError,
      });
      throw new Error(`Prior pack discovery count failed: ${priorPackError.message}`);
    }
    if (priorUserError) {
      console.error("[shred] ✗ Prior user discovery count failed", {
        error: priorUserError.message,
        details: priorUserError,
      });
      throw new Error(`Prior user discovery count failed: ${priorUserError.message}`);
    }

    const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
      .from("profiles")
      .select("id, username, xp, packs_shredded, level")
      .eq("id", profileId)
      .maybeSingle();
    if (profileLookupError) {
      console.error("[shred] ✗ Profile lookup failed", {
        error: profileLookupError.message,
        details: profileLookupError,
      });
      throw new Error(`Profile lookup failed: ${profileLookupError.message}`);
    }

    const nextXp = Number(existingProfile?.xp ?? 0) + xpGain;
    const nextPacksShredded = Number(existingProfile?.packs_shredded ?? 0) + 1;
    const nextLevel = Math.max(1, Math.floor(nextXp / 500) + 1);

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert({
      id: profileId,
      wallet: normalizedWallet,
      username: data.username ?? existingProfile?.username ?? null,
      xp: nextXp,
      packs_shredded: nextPacksShredded,
      level: nextLevel,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profileError) {
      console.error("[shred] ✗ Profile stats save failed", {
        error: profileError.message,
        details: profileError,
      });
      throw new Error(`Profile stats save failed: ${profileError.message}`);
    }
    console.info("[shred] ✓ Profile stats saved", {
      profileId,
      xpGain,
      nextXp,
      nextPacksShredded,
    });

    const rows = data.items.map((i) => ({
      user_id: profileId,
      pack_id: data.packId,
      kind: i.kind,
      title: i.title,
      sub: i.sub,
      rarity: i.rarity ?? "Common",
      amount: i.amount ?? null,
    }));
    const { error } = await supabaseAdmin.from("discoveries").insert(rows);
    if (error) {
      console.error("[shred] ✗ Discovery/reward insert failed", {
        error: error.message,
        details: error,
        rows,
      });
      throw new Error(`Discovery/reward insert failed: ${error.message}`);
    }
    console.info("[shred] ✓ Reward saved", {
      profileId,
      packId: data.packId,
      rows: rows.length,
    });

    const { error: statsError } = await supabaseAdmin.rpc("apply_shred", {
      _pack_id: data.packId,
      _drops: data.items.length,
      _rewards_usdm: 0,
      _is_new_owner: (priorPackCount ?? 0) === 0,
      _is_new_shredder: (priorUserCount ?? 0) === 0,
    });
    if (statsError) {
      console.error("[shred] ✗ Pack/global stat update failed", {
        error: statsError.message,
        details: statsError,
      });
      throw new Error(`Pack/global stat update failed: ${statsError.message}`);
    }
    console.info("[shred] ✓ Pack/global stats updated", {
      packId: data.packId,
      drops: data.items.length,
    });

    const feedRows = data.items
      .filter((i) => i.kind !== "XP")
      .map((i) => ({
        username: data.username ?? existingProfile?.username ?? normalizedWallet.slice(0, 6),
        wallet: normalizedWallet,
        pack_id: data.packId,
        kind: i.kind,
        text: i.kind === "USDM"
          ? `discovered ${i.amount?.toFixed(i.amount && i.amount < 0.01 ? 3 : 2)} USDM`
          : i.kind === "CARD"
          ? `collected ${i.title}`
          : "discovered a fact",
        amount: i.amount ?? null,
      }));

    if (feedRows.length > 0) {
      const { error: feedError } = await supabaseAdmin.from("live_feed").insert(feedRows);
      if (feedError) {
        console.error("[shred] ✗ Live feed insert failed", {
          error: feedError.message,
          details: feedError,
          feedRows,
        });
        throw new Error(`Live feed insert failed: ${feedError.message}`);
      }
      console.info("[shred] ✓ Live feed saved", { rows: feedRows.length });
    }

    console.info("[shred] ✓ Database persistence complete", {
      profileId,
      packId: data.packId,
    });

    return {
      ok: true,
      xp: xpGain,
      profile: {
        id: profileId,
        wallet: normalizedWallet,
        username: data.username ?? existingProfile?.username ?? null,
        xp: nextXp,
        packs_shredded: nextPacksShredded,
        level: nextLevel,
      },
    };
  });

export const getStarterCooldown = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).parse(raw ?? {}))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("./supabase-admin.server");
    const supabaseAdmin = getSupabaseAdmin();
    const STARTER_PACK_COOLDOWN_MS = 12 * 60 * 60 * 1000;
    const profileId = walletToProfileId(data.wallet);
    const cutoff = new Date(Date.now() - STARTER_PACK_COOLDOWN_MS).toISOString();
    const { data: recentStarter, error } = await supabaseAdmin
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
    const { getSupabaseAdmin } = await import("./supabase-admin.server");
    const supabaseAdmin = getSupabaseAdmin();
    const profileId = walletToProfileId(data.wallet);
    const { data: rows, error } = await supabaseAdmin
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
    const { getSupabaseAdmin } = await import("./supabase-admin.server");
    const supabaseAdmin = getSupabaseAdmin();

    const [{ data: packRows, error: packError }, { data: globalRow, error: globalError }, { data: feedRows, error: feedError }] = await Promise.all([
      supabaseAdmin.from("pack_stats").select("pack_id,owners,shreds,drops").order("pack_id"),
      supabaseAdmin.from("global_stats").select("shredders,packs_shredded,discoveries,rewards_usdm").eq("id", 1).maybeSingle(),
      supabaseAdmin.from("live_feed").select("username,wallet,pack_id,kind,text,amount").order("created_at", { ascending: false }).limit(30),
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
    const { getSupabaseAdmin } = await import("./supabase-admin.server");
    const supabaseAdmin = getSupabaseAdmin();
    const profileId = walletToProfileId(data.wallet);
    const normalizedWallet = data.wallet.toLowerCase();
    await supabaseAdmin.from("profiles").upsert({
      id: profileId,
      wallet: normalizedWallet,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    const { error } = await supabaseAdmin.from("pack_purchases").insert({
      user_id: profileId,
      pack_id: data.packId,
      order_id: data.orderId,
      tx_hash: data.txHash ?? null,
      price_usdm: data.priceUsdm,
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
    const { getSupabaseAdmin } = await import("./supabase-admin.server");
    const supabaseAdmin = getSupabaseAdmin();
    const { data: rows, error } = await supabaseAdmin
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
