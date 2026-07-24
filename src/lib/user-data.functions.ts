// Server fns backing profile, leaderboard, activity, and pack purchase records.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Json } from "@/integrations/supabase/types";
import { PACK_PRICE_USDM } from "@/lib/contracts";
import { normalizeWallet, walletToProfileId } from "@/lib/profile";

/* -------------------- Profile / username -------------------- */

const ProfileUpsertInput = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  username: z.string().min(1).max(32).optional(),
  xp: z.number().int().nonnegative().optional(),
  packs_shredded: z.number().int().nonnegative().optional(),
  level: z.number().int().positive().optional(),
  avatar_url: z.string().max(60000).optional(),
});

const SHRED_PACKS = ["starter", "mystery", "alpha", "legendary", "explorer"] as const;
const STARTER_PACK_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export const upsertProfile = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => ProfileUpsertInput.parse(raw))
  .handler(async ({ data }) => {
    const normalizedWallet = normalizeWallet(data.wallet) ?? data.wallet.toLowerCase();
    const { getSupabasePublic } = await import("./supabase-public.server");
    const supabasePublic = getSupabasePublic();

    // If no username was supplied, try to recover the wallet's on-chain identity
    // from the Celo username registry so leaderboard rows show @handle not 0x…
    let username = data.username;
    if (!username || username.trim().length === 0) {
      const { resolveOnchainUsername } = await import("./onchain-username.server");
      const resolved = await resolveOnchainUsername(normalizedWallet);
      if (resolved) username = resolved;
    }

    const { error } = await supabasePublic.rpc("upsert_wallet_profile", {
      _wallet: normalizedWallet,
      _username: username,
      _xp: data.xp,
      _packs_shredded: data.packs_shredded,
      _level: data.level,
      _avatar_url: data.avatar_url,
    });
    if (error) throw new Error(error.message);
    return { ok: true, username: username ?? null };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({ wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/) }).parse(raw ?? {}))
  .handler(async ({ data }) => {
    const normalizedWallet = data.wallet.toLowerCase();
    const { getSupabasePublic } = await import("./supabase-public.server");
    const { resolveOnchainUsername } = await import("./onchain-username.server");
    const supabasePublic = getSupabasePublic();
    const profileId = walletToProfileId(data.wallet);

    const { data: row, error } = await supabasePublic
      .from("profiles").select("*").eq("id", profileId).maybeSingle();
    if (error) throw new Error(error.message);

    if (!row || !row.username || row.username.trim().length === 0) {
      const resolved = await resolveOnchainUsername(normalizedWallet, { force: true });
      if (resolved) {
        const { error: upsertError } = await supabasePublic.rpc("upsert_wallet_profile", {
          _wallet: normalizedWallet,
          _username: resolved,
        });
        if (upsertError) {
          console.warn("[profile] failed to backfill on-chain username", { wallet: normalizedWallet, error: upsertError.message });
        } else {
          const { data: updatedRow, error: updatedError } = await supabasePublic
            .from("profiles").select("*").eq("id", profileId).maybeSingle();
          if (updatedError) throw new Error(updatedError.message);
          return updatedRow ?? row;
        }
      }
    }

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
    rarity: z.enum(["Common", "Uncommon", "Rare", "Epic", "Legendary", "Mythic"]).optional(),
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
    let username = data.username;
    if (!username || username.trim().length === 0) {
      const { resolveOnchainUsername } = await import("./onchain-username.server");
      username = (await resolveOnchainUsername(normalizedWallet)) ?? undefined;
    }
    const { data: result, error } = await supabasePublic.rpc("record_wallet_shred", {
      _wallet: normalizedWallet,
      _username: username ?? "",
      _pack_id: data.packId,
      _items: items as Json,
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

    const [{ data: packRows, error: packError }, { data: globalRow, error: globalError }, { data: feedRows, error: feedError }, { data: avatarRows }] = await Promise.all([
      supabasePublic.from("pack_stats").select("pack_id,owners,shreds,drops").order("pack_id"),
      supabasePublic.from("global_stats").select("shredders,packs_shredded,discoveries,rewards_usdm").eq("id", 1).maybeSingle(),
      supabasePublic.from("live_feed").select("username,wallet,pack_id,kind,text,amount").order("created_at", { ascending: false }).limit(30),
      supabasePublic.from("profiles").select("wallet, username, avatar_url").not("avatar_url", "is", null).limit(500),
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

    const avatarByWallet: Record<string, string> = {};
    (avatarRows ?? []).forEach((row) => {
      if (row.wallet && row.avatar_url) avatarByWallet[row.wallet.toLowerCase()] = row.avatar_url;
    });

    return {
      packStats,
      globalStats,
      avatarByWallet,
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
    txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional().nullable(),
    priceUsdm: z.number().positive(),
  }).parse(raw))
  .handler(async ({ data }) => {
    if (!data.txHash) {
      throw new Error("Purchase verification requires a transaction hash.");
    }

    // CRITICAL: verify the submitted payment transaction receipt before
    // recording the purchase. This keeps the flow fast and secure because we
    // only inspect the exact tx that the user just submitted and require the
    // PackPurchased event to be present.
    const { verifyPackPurchaseOnChain } = await import("./verify-purchase.server");
    const verified = await verifyPackPurchaseOnChain({
      wallet: data.wallet,
      txHash: data.txHash,
      packId: data.packId,
      orderId: data.orderId,
      priceUsdm: data.priceUsdm,
    });
    if (!verified.valid) {
      console.error("[purchase] ✗ On-chain verification failed", { wallet: data.wallet, txHash: data.txHash, orderId: data.orderId, reason: verified.reason });
      throw new Error(`Purchase verification failed: ${verified.reason}`);
    }
    const txHash = data.txHash;
    const { getSupabasePublic } = await import("./supabase-public.server");
    const supabasePublic = getSupabasePublic();
    const { error } = await supabasePublic.rpc("record_wallet_pack_purchase", {
      _wallet: data.wallet.toLowerCase(),
      _pack_id: data.packId,
      _order_id: data.orderId,
      _tx_hash: txHash,
      _price_usdm: data.priceUsdm,
    });
    if (error && !/duplicate key/i.test(error.message)) throw new Error(error.message);
    console.info("[purchase] ✓ Verified and recorded", { wallet: data.wallet, packId: data.packId, orderId: data.orderId, txHash });
    return { ok: true, orderId: data.orderId, txHash };
  });

export const findUnclaimedPackPurchase = createServerFn({ method: "GET" })
  .inputValidator((raw: unknown) => z.object({
    wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
    packId: z.enum(SHRED_PACKS),
  }).parse(raw ?? {}))
  .handler(async ({ data }) => {
    const { getSupabasePublic } = await import("./supabase-public.server");
    const { verifyPackPurchaseOnChain } = await import("./verify-purchase.server");
    const supabasePublic = getSupabasePublic();
    const profileId = walletToProfileId(data.wallet);
    const { data: rows, error } = await supabasePublic
      .from("pack_purchases")
      .select("order_id, tx_hash, price_usdm, created_at")
      .eq("user_id", profileId)
      .eq("pack_id", data.packId)
      .eq("reward_paid", false)
      .not("tx_hash", "is", null)
      .order("created_at", { ascending: true })
      .limit(10);

    if (error) throw new Error(error.message);

    for (const row of rows ?? []) {
      if (!row.tx_hash) continue;
      const ok = await verifyPackPurchaseOnChain({
        wallet: data.wallet,
        txHash: row.tx_hash,
        packId: data.packId,
        orderId: row.order_id,
        priceUsdm: Number(row.price_usdm ?? 0),
      });
      if (ok.valid) {
        return { ok: true, orderId: row.order_id, txHash: row.tx_hash, createdAt: row.created_at };
      }
    }

    return { ok: false, orderId: null, txHash: null, createdAt: null };
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
      .select("username, wallet, xp, packs_shredded, avatar_url")
      .order("xp", { ascending: false })
      .order("packs_shredded", { ascending: false })
      .limit(50);
    if (error) return [];

    // Lazily backfill on-chain usernames for leaderboard rows that are still
    // showing a bare wallet address. Resolves at most 50 wallets, cached in
    // memory for 10 minutes so repeated fetches are cheap.
    const missing = (rows ?? []).filter((r) => r.wallet && (!r.username || r.username.trim().length === 0));
    if (missing.length > 0) {
      const { resolveOnchainUsername } = await import("./onchain-username.server");
      await Promise.all(
        missing.map(async (r) => {
          const name = await resolveOnchainUsername(r.wallet as string);
          if (!name) return;
          r.username = name;
          try {
            await supabasePublic.rpc("upsert_wallet_profile", {
              _wallet: (r.wallet as string).toLowerCase(),
              _username: name,
            });
          } catch (e) {
            console.warn("[leaderboard] backfill upsert failed", { wallet: r.wallet, error: (e as Error)?.message });
          }
        }),
      );
    }

    return (rows ?? []).map((row) => ({ ...row, range: data.range })) as Array<{
      username: string | null;
      wallet: string | null;
      xp: number;
      packs_shredded: number;
      avatar_url: string | null;
      range: string;
    }>;
  });

  export const getMyLeaderboardRank = createServerFn({ method: "GET" })
    .inputValidator((raw: unknown) => z.object({ wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/), range: z.enum(["daily", "weekly", "monthly", "all"]).default("weekly") }).parse(raw ?? {}))
    .handler(async ({ data }) => {
      const { getSupabasePublic } = await import("./supabase-public.server");
      const supabasePublic = getSupabasePublic();
      const profileId = walletToProfileId(data.wallet);

      // Fetch the user's profile row
      const { data: meRow, error: meErr } = await supabasePublic
        .from("profiles").select("id, username, wallet, xp, packs_shredded, avatar_url").eq("id", profileId).maybeSingle();
      if (meErr) throw new Error(meErr.message);
        // If the user doesn't yet have a profile row, compute their rank
        // relative to existing profiles assuming 0 XP and 0 packs_shredded,
        // and return a minimal profile so the frontend can display it.
        if (!meRow) {
          const xp = 0;
          const packs = 0;
          const filter = `xp.gt.${xp},(xp.eq.${xp},packs_shredded.gt.${packs})`;
          const { count, error: countErr } = await supabasePublic
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .or(filter);
          if (countErr) throw new Error(countErr.message);
          const outrank = Number(count ?? 0);
          const rank = outrank + 1;
          return {
            ok: true,
            rank,
            profile: {
              id: profileId,
              username: null,
              wallet: data.wallet.toLowerCase(),
              xp: 0,
              packs_shredded: 0,
              avatar_url: null,
            },
          };
        }

        const xp = Number(meRow.xp ?? 0);
        const packs = Number(meRow.packs_shredded ?? 0);

        // Count how many profiles outrank this user (higher xp, or equal xp but more packs_shredded)
        const filter = `xp.gt.${xp},(xp.eq.${xp},packs_shredded.gt.${packs})`;
        const { count, error: countErr } = await supabasePublic
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .or(filter);
        if (countErr) throw new Error(countErr.message);
        const outrank = Number(count ?? 0);
        const rank = outrank + 1;

        return { ok: true, rank, profile: meRow };
    });
