// Public server fn: records a shred to the DB (stats + live feed).
// Called client-side after a successful reveal. No auth required — this is
// broadcast data used by every viewer. Rate-limit-safe: any spam would only
// pollute the live ticker, and duplicates are eventually pruned by the LIMIT.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Item = z.object({
  kind: z.enum(["USDM", "USDT", "XP", "CARD", "FACT"]),
  title: z.string().min(1).max(80),
  amount: z.number().optional(),
});

const Input = z.object({
  packId: z.enum(["starter", "mystery", "alpha", "legendary", "explorer"]),
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/).nullable(),
  username: z.string().min(1).max(32),
  items: z.array(Item).min(1).max(8),
});

export const announceShred = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }) => {
    const { getSupabaseAdmin } = await import("./supabase-admin.server");
    const supabaseAdmin = getSupabaseAdmin();

    // Determine "new owner" (first shred of this pack by this wallet)
    // and "new shredder" (first shred ever by this wallet).
    let isNewOwner = true;
    let isNewShredder = true;
    if (data.wallet) {
      const w = data.wallet.toLowerCase();
      const { count: packCount } = await supabaseAdmin
        .from("live_feed")
        .select("id", { count: "exact", head: true })
        .eq("wallet", w)
        .eq("pack_id", data.packId);
      isNewOwner = (packCount ?? 0) === 0;
      const { count: allCount } = await supabaseAdmin
        .from("live_feed")
        .select("id", { count: "exact", head: true })
        .eq("wallet", w);
      isNewShredder = (allCount ?? 0) === 0;
    }

    const rewards = data.items
      .filter((i) => i.kind === "USDM" || i.kind === "USDT")
      .reduce((s, i) => s + (i.amount ?? 0), 0);

    const { data: currentPackRow, error: packLookupError } = await supabaseAdmin
      .from("pack_stats")
      .select("pack_id, owners, shreds, drops")
      .eq("pack_id", data.packId)
      .maybeSingle();
    if (packLookupError) throw new Error(packLookupError.message);

    const nextPackStats = {
      pack_id: data.packId,
      owners: Number(currentPackRow?.owners ?? 0) + (isNewOwner ? 1 : 0),
      shreds: Number(currentPackRow?.shreds ?? 0) + 1,
      drops: Number(currentPackRow?.drops ?? 0) + Math.max(data.items.length, 0),
      updated_at: new Date().toISOString(),
    };
    const { error: packStatsError } = await supabaseAdmin.from("pack_stats").upsert(nextPackStats, { onConflict: "pack_id" });
    if (packStatsError) throw new Error(packStatsError.message);

    const { data: currentGlobalRow, error: globalLookupError } = await supabaseAdmin
      .from("global_stats")
      .select("id, shredders, packs_shredded, discoveries, rewards_usdm")
      .eq("id", 1)
      .maybeSingle();
    if (globalLookupError) throw new Error(globalLookupError.message);

    const nextGlobalStats = {
      id: 1,
      shredders: Number(currentGlobalRow?.shredders ?? 0) + (isNewShredder ? 1 : 0),
      packs_shredded: Number(currentGlobalRow?.packs_shredded ?? 0) + 1,
      discoveries: Number(currentGlobalRow?.discoveries ?? 0) + Math.max(data.items.length, 0),
      rewards_usdm: Number(currentGlobalRow?.rewards_usdm ?? 0) + Math.max(rewards, 0),
      updated_at: new Date().toISOString(),
    };
    const { error: globalStatsError } = await supabaseAdmin.from("global_stats").upsert(nextGlobalStats, { onConflict: "id" });
    if (globalStatsError) throw new Error(globalStatsError.message);

    // Insert one feed row per item (skip XP to keep feed tight)
    const feedRows = data.items
      .filter((i) => i.kind !== "XP")
      .map((i) => ({
        username: data.username,
        wallet: data.wallet?.toLowerCase() ?? null,
        pack_id: data.packId,
        kind: i.kind,
        text: i.kind === "USDM" || i.kind === "USDT"
          ? `discovered ${i.amount?.toFixed(i.amount && i.amount < 0.01 ? 3 : 2)} ${i.kind}`
          : i.kind === "CARD"
          ? `collected ${i.title}`
          : `discovered a fact`,
        amount: i.amount ?? null,
      }));

    if (feedRows.length > 0) {
      await supabaseAdmin.from("live_feed").insert(feedRows);
    }

    return { ok: true, isNewOwner, isNewShredder };
  });
