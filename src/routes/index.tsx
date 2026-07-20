import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ChangeEvent } from "react";
import {
  Trophy, User, Users, Package, Gem, Wallet, Flame, Gift, Star,
  Lightbulb, X, ChevronLeft, ChevronRight, Award, Zap,
  ArrowRight, AlertTriangle, Check, Loader2, HelpCircle, ExternalLink, Camera,
} from "lucide-react";
import { BackgroundMusic } from "@/components/BackgroundMusic";
import { useServerFn } from "@tanstack/react-start";
import { useWallet, shortAddr } from "@/lib/wallet";
import { audio } from "@/lib/audio";
import { rollUsdm, formatUsdm } from "@/lib/rewards";
import { toStoredProfile } from "@/lib/profile";
import { distributeReward } from "@/lib/distribute-reward.functions";

import {
  upsertProfile,
  getMyProfile,
  recordShred,
  listMyDiscoveries,
  getStarterCooldown,
  recordPackPurchase,
  findUnclaimedPackPurchase,
  getLeaderboard,
  getStatsAndFeed,
} from "@/lib/user-data.functions";
import {
  PACK_KEY, PACK_PRICE_USDM, USDM_ADDRESS, PAYMENT_CONTRACT,
  PAYMENT_ABI, ERC20_ABI, CELO_CHAIN_ID,
  USERNAME_CONTRACT, USERNAME_ABI,
} from "@/lib/contracts";
const onboarding1 = { url: "/onboarding/onboarding-1.png" };
const onboarding2 = { url: "/onboarding/onboarding-2.png" };
const onboarding3 = { url: "/onboarding/onboarding-3.png" };
const onboarding4 = { url: "/onboarding/onboarding-4.png" };

// Asset maps: sealed + shredded packs, discovery images, collectible cards
const PACK_IMG: Record<string, string> = {
  starter: "/packs/starter.png",
  mystery: "/packs/mystery.png",
  alpha: "/packs/alpha.png",
  legendary: "/packs/legendary.png",
  explorer: "/packs/explorer.png",
};
const SHREDDED_IMG: Record<string, string> = {
  starter: "/packs/starter-shredded.png",
  mystery: "/packs/mystery-shredded.png",
  alpha: "/packs/alpha-shredded.png",
  legendary: "/packs/legendary-shredded.png",
  explorer: "/packs/explorer-shredded.png",
};
const DISCOVERY_IMG = {
  usdm: "/discoveries/usdm-coin.png",
  xp: "/discoveries/xp-crystal.png",
  fact: "/discoveries/did-you-know.png",
};
const WORDMARK_SRC = "/shreds-wordmark.png";
export const CARD_LIBRARY: Record<string, string> = {
  "celo-compass": "/cards/celo-compass.png",
  "minipay-sigil": "/cards/minipay-sigil.png",
  "neon-cube": "/cards/neon-cube.jpg",
  "celo-orbis": "/cards/celo-orbis.png",
  "celo-genesis-core": "/cards/celo-genesis-core.png",
  "celo-genesis-shard": "/cards/celo-genesis-shard.png",
  "celo-relic-ring": "/cards/celo-relic-ring.png",
  "trust-lens": "/cards/trust-lens.png",
  "minipay-prism": "/cards/minipay-prism.png",
  "celo-sentinel": "/cards/celo-sentinel.png",
  "minipay-transceiver": "/cards/minipay-transceiver.png",
  "data-shard": "/cards/data-shard.png",
  "minipay-oracle": "/cards/minipay-oracle.png",
  "celo-prime-shard": "/cards/celo-prime-shard.png",
  "verity-node": "/cards/verity-node.png",
};

export const Route = createFileRoute("/")({ component: HomeScreen });

const STARTER_PACK_COOLDOWN_MS = 12 * 60 * 60 * 1000;

type Pack = {
  id: string; name: string; image: string; shredded: string;
  accent: string; glow: string; price: string; priceNum: number;
  owners: string; shreddedCnt: string; discoveries: string;
};

const PACKS: Pack[] = [
  { id: "starter", name: "Starter Pack", image: PACK_IMG.starter, shredded: SHREDDED_IMG.starter, accent: "oklch(0.88 0.28 135)", glow: "oklch(0.88 0.28 135 / 55%)", price: "FREE", priceNum: 0, owners: "—", shreddedCnt: "—", discoveries: "—" },
  { id: "mystery", name: "Mystery Pack", image: PACK_IMG.mystery, shredded: SHREDDED_IMG.mystery, accent: "oklch(0.68 0.22 300)", glow: "oklch(0.68 0.22 300 / 55%)", price: "$0.25", priceNum: 0.25, owners: "—", shreddedCnt: "—", discoveries: "—" },
  { id: "alpha", name: "Alpha Pack", image: PACK_IMG.alpha, shredded: SHREDDED_IMG.alpha, accent: "oklch(0.82 0.17 85)", glow: "oklch(0.82 0.17 85 / 55%)", price: "$0.75", priceNum: 0.75, owners: "—", shreddedCnt: "—", discoveries: "—" },
  { id: "legendary", name: "Legendary Pack", image: PACK_IMG.legendary, shredded: SHREDDED_IMG.legendary, accent: "oklch(0.78 0.2 60)", glow: "oklch(0.78 0.2 60 / 55%)", price: "$1.50", priceNum: 1.50, owners: "—", shreddedCnt: "—", discoveries: "—" },
  { id: "explorer", name: "Explorer Pack", image: PACK_IMG.explorer, shredded: SHREDDED_IMG.explorer, accent: "oklch(0.85 0.18 75)", glow: "oklch(0.85 0.18 75 / 55%)", price: "$3.00", priceNum: 3.00, owners: "—", shreddedCnt: "—", discoveries: "—" },
];

/* -------------------- Facts (100) -------------------- */
const FACTS: string[] = [
  "MiniPay is built on the Celo blockchain.",
  "MiniPay is integrated into the Opera Mini browser.",
  "You can send stablecoins using MiniPay.",
  "Celo was designed with mobile users in mind.",
  "Celo aims to make digital payments accessible worldwide.",
  "Wallet addresses on Celo can be mapped to phone numbers.",
  "Celo supports multiple stable assets.",
  "Transactions on Celo are generally fast.",
  "Celo is open source.",
  "Anyone can build apps on Celo.",
  "USDT is available on Celo.",
  "USDM is available on Celo.",
  "Stablecoins are designed to maintain a stable value.",
  "Stablecoins can help reduce exposure to price volatility.",
  "Many people use stablecoins for payments.",
  "Stablecoins can be transferred globally.",
  "Digital dollars move much faster than many bank transfers.",
  "Stablecoins can be used in decentralized applications.",
  "Some merchants accept stablecoin payments.",
  "Stablecoins make cross-border payments easier.",
  "Keep your recovery phrase secure.",
  "Never share your wallet recovery phrase.",
  "Double-check wallet addresses before sending funds.",
  "Update your app regularly.",
  "Beware of fake giveaways.",
  "Only connect to trusted apps.",
  "Verify official community links.",
  "Small transactions are a good way to test a new address.",
  "Protect your device with a passcode.",
  "Never send funds to someone promising guaranteed returns.",
  "Thousands of developers are building on Celo.",
  "Celo supports decentralized finance applications.",
  "Celo supports NFT projects.",
  "Games can be built on Celo.",
  "Mini apps can integrate with MiniPay.",
  "Celo supports smart contracts.",
  "Developers can create custom tokens on Celo.",
  "Communities around the world build on Celo.",
  "Celo focuses on real-world utility.",
  "New projects join the ecosystem regularly.",
  "A blockchain is a shared digital ledger.",
  "Transactions are recorded on-chain.",
  "Wallets let you manage digital assets.",
  "Every wallet has a unique address.",
  "Digital assets stay in your wallet, not inside an app.",
  "Smart contracts automate transactions.",
  "Transactions are cryptographically verified.",
  "Blockchains help reduce reliance on intermediaries.",
  "Different blockchains have different strengths.",
  "Blockchain powers more than cryptocurrencies.",
  "Every Shred is a new discovery.",
  "Collection cards can be rare.",
  "Some discoveries are more valuable than others.",
  "Completing collections unlocks achievements.",
  "Rare discoveries appear less frequently.",
  "Limited editions may only be available for a short time.",
  "Every pack guarantees at least one discovery.",
  "Legendary packs offer access to premium discoveries.",
  "Mystery packs are designed for surprise.",
  "Every collection tells a story.",
  "Every Shred contributes to community statistics.",
  "Leaderboards reward active participants.",
  "XP increases your rank.",
  "Collections showcase your journey.",
  "Every discovery is permanently recorded in your profile.",
  "Some achievements are hidden.",
  "Daily activity helps grow your collection.",
  "Community milestones unlock future events.",
  "Every user starts with the same opportunity.",
  "Discoveries are meant to be shared.",
  "Every pack teaches something new.",
  "Small facts are easier to remember.",
  "Learning through play improves engagement.",
  "Curiosity drives exploration.",
  "Knowledge can be collected just like rewards.",
  "Great communities grow through education.",
  "Every discovery expands your understanding.",
  "Questions lead to innovation.",
  "Technology evolves every day.",
  "The best builders never stop learning.",
  "Your next pack could contain something legendary.",
  "Not every rare card has been discovered yet.",
  "Every swipe begins a new discovery.",
  "Every collection starts with one card.",
  "Legendary discoveries are designed to feel special.",
  "Every pack has a story.",
  "Great explorers are always curious.",
  "The community grows with every new Shredder.",
  "Discovery is part of the adventure.",
  "Every reward starts with a single shred.",
  "Shreds is built around discovery.",
  "Every pack has multiple possible outcomes.",
  "The pack is the heart of the experience.",
  "Swipe to choose your pack.",
  "Slash to reveal what's inside.",
  "Your profile grows with every discovery.",
  "Collection cards become part of your permanent album.",
  "Every XP point moves you up the leaderboard.",
  "New discoveries will continue to be added over time.",
  "Your next shred could reveal something unforgettable.",
];

/* -------------------- Discoveries -------------------- */
type Discovery = {
  kind: "USDM" | "XP" | "CARD" | "FACT";
  title: string; sub: string; color: string; Icon: React.ComponentType<{ className?: string }>;
  rarity?: "Common" | "Uncommon" | "Rare" | "Epic" | "Legendary" | "Mythic";
  image?: string;
  amountRaw?: number;
  txHash?: string | null;
  createdAt?: string | null;
};

type LeaderboardRow = { username: string | null; wallet: string | null; xp: number; packs_shredded: number; avatar_url?: string | null; range: string };
type ProfileSummary = { username: string | null; wallet: string | null; xp: number; packs_shredded: number; level: number; avatar_url?: string | null };

function toUiDiscovery(item: { kind: string; title: string; sub: string; rarity?: string | null; amount?: number | null; tx_hash?: string | null; created_at?: string | null }): Discovery {
  const amount = typeof item.amount === "number" ? item.amount : undefined;
  const base = { txHash: item.tx_hash ?? null, createdAt: item.created_at ?? null };
  switch (item.kind) {
    case "USDM":
      return {
        kind: "USDM",
        title: item.title,
        sub: item.sub,
        color: "oklch(0.75 0.2 145)",
        Icon: Wallet,
        rarity: (item.rarity as Discovery["rarity"]) ?? "Common",
        image: DISCOVERY_IMG.usdm,
        amountRaw: amount,
        ...base,
      };
    case "XP":
      return {
        kind: "XP",
        title: item.title,
        sub: item.sub,
        color: "oklch(0.7 0.2 250)",
        Icon: Star,
        rarity: (item.rarity as Discovery["rarity"]) ?? "Common",
        image: DISCOVERY_IMG.xp,
        amountRaw: amount,
        ...base,
      };
    case "CARD":
      return {
        kind: "CARD",
        title: item.title,
        sub: item.sub,
        color: "oklch(0.75 0.18 180)",
        Icon: Award,
        rarity: (item.rarity as Discovery["rarity"]) ?? "Rare",
        image: CARD_IMAGE_BY_TITLE[item.title.toLowerCase()] ?? CARD_LIBRARY["neon-cube"],
        amountRaw: amount,
        ...base,
      };
    default:
      return {
        kind: "FACT",
        title: item.title,
        sub: item.sub,
        color: "oklch(0.7 0.22 300)",
        Icon: Lightbulb,
        rarity: "Common",
        image: DISCOVERY_IMG.fact,
        amountRaw: amount,
        ...base,
      };
  }
}

/* -------------------- Card collections --------------------
 * Structured to make adding new collections trivial: append a new entry to
 * CARDS with an `image` key from CARD_LIBRARY, and (optionally) drop it into
 * a specific `packs` array to weight where it can appear. If `packs` is
 * omitted the card is eligible for every pack. Rarity drives visual accent
 * and roughly the drop probability inside a given pack.
 */
type CardDef = Discovery & { packs?: string[] };
const CARDS: CardDef[] = [
  // Rare
  { kind: "CARD", title: "Neon Cube", sub: "Chance. Mystery. Reward.", color: "oklch(0.75 0.18 180)", Icon: Award, rarity: "Rare", image: CARD_LIBRARY["neon-cube"] },
  { kind: "CARD", title: "Celo Compass", sub: "Navigate the Celo ecosystem.", color: "oklch(0.75 0.2 145)", Icon: Award, rarity: "Rare", image: CARD_LIBRARY["celo-compass"] },
  { kind: "CARD", title: "MiniPay Sigil", sub: "Trust. Connect. Transfer.", color: "oklch(0.7 0.22 300)", Icon: Award, rarity: "Rare", image: CARD_LIBRARY["minipay-sigil"] },
  { kind: "CARD", title: "Data Shard", sub: "Fragments that remember.", color: "oklch(0.78 0.2 200)", Icon: Award, rarity: "Rare", image: CARD_LIBRARY["data-shard"] },
  // Uncommon
  { kind: "CARD", title: "Verity Node", sub: "Truth in data. Power in trust.", color: "oklch(0.82 0.22 135)", Icon: Award, rarity: "Uncommon", image: CARD_LIBRARY["verity-node"] },
  // Epic
  { kind: "CARD", title: "Celo Orbis", sub: "The heart of decentralized trust.", color: "oklch(0.7 0.22 300)", Icon: Award, rarity: "Epic", image: CARD_LIBRARY["celo-orbis"] },
  { kind: "CARD", title: "Celo Relic Ring", sub: "Powered by legacy.", color: "oklch(0.85 0.22 130)", Icon: Award, rarity: "Epic", image: CARD_LIBRARY["celo-relic-ring"] },
  { kind: "CARD", title: "Trust Lens", sub: "See beyond. Trust deeper.", color: "oklch(0.7 0.22 300)", Icon: Award, rarity: "Epic", image: CARD_LIBRARY["trust-lens"] },
  { kind: "CARD", title: "Celo Sentinel", sub: "Protect. Verify. Empower.", color: "oklch(0.82 0.22 135)", Icon: Award, rarity: "Epic", image: CARD_LIBRARY["celo-sentinel"] },
  { kind: "CARD", title: "MiniPay Transceiver", sub: "Send value. Anywhere. Instantly.", color: "oklch(0.7 0.22 300)", Icon: Award, rarity: "Epic", image: CARD_LIBRARY["minipay-transceiver"] },
  // Legendary
  { kind: "CARD", title: "Celo Genesis Core", sub: "Trust isn't given. It's protocol.", color: "oklch(0.82 0.17 85)", Icon: Award, rarity: "Legendary", image: CARD_LIBRARY["celo-genesis-core"], packs: ["legendary", "explorer", "alpha"] },
  { kind: "CARD", title: "Celo Genesis Shard", sub: "Origins power everything.", color: "oklch(0.82 0.17 85)", Icon: Award, rarity: "Legendary", image: CARD_LIBRARY["celo-genesis-shard"], packs: ["legendary", "explorer", "alpha"] },
  { kind: "CARD", title: "MiniPay Prism", sub: "Value flows. Trust remains.", color: "oklch(0.85 0.22 130)", Icon: Award, rarity: "Legendary", image: CARD_LIBRARY["minipay-prism"], packs: ["legendary", "explorer", "alpha"] },
  { kind: "CARD", title: "MiniPay Oracle", sub: "See intent. Shape impact.", color: "oklch(0.7 0.22 300)", Icon: Award, rarity: "Legendary", image: CARD_LIBRARY["minipay-oracle"], packs: ["legendary", "explorer", "alpha"] },
  // Mythic — explorer-only jackpot
  { kind: "CARD", title: "Celo Prime Shard", sub: "Rare origin. Limitless destiny.", color: "oklch(0.75 0.25 350)", Icon: Award, rarity: "Mythic", image: CARD_LIBRARY["celo-prime-shard"], packs: ["explorer", "legendary"] },
];

// Card-title → image resolver used when hydrating server-persisted discoveries.
export const CARD_IMAGE_BY_TITLE: Record<string, string> = CARDS.reduce((acc, c) => {
  if (c.image) acc[c.title.toLowerCase()] = c.image;
  return acc;
}, {} as Record<string, string>);

// Fixed XP per pack — every successful shred awards exactly this much XP.
const PACK_XP: Record<string, number> = {
  starter: 100,
  mystery: 200,
  alpha: 400,
  legendary: 800,
  explorer: 1600,
};

// Rarity weights per pack — higher tiers see more Epic/Legendary/Mythic drops.
const PACK_RARITY_WEIGHTS: Record<string, Partial<Record<NonNullable<Discovery["rarity"]>, number>>> = {
  starter:   { Common: 60, Uncommon: 30, Rare: 10 },
  mystery:   { Uncommon: 45, Rare: 40, Epic: 15 },
  alpha:     { Rare: 45, Epic: 40, Legendary: 15 },
  legendary: { Epic: 40, Legendary: 55, Mythic: 5 },
  explorer:  { Epic: 30, Legendary: 55, Mythic: 15 },
};

// Probability the pack drops a card at all (in addition to the fact/XP/USDM).
const PACK_CARD_CHANCE: Record<string, number> = {
  starter: 0.4,
  mystery: 0.6,
  alpha: 0.8,
  legendary: 1,
  explorer: 1,
};

function pickCardForPack(packId: string): CardDef | null {
  const eligible = CARDS.filter((c) => !c.packs || c.packs.includes(packId));
  if (eligible.length === 0) return null;
  const weights = PACK_RARITY_WEIGHTS[packId] ?? PACK_RARITY_WEIGHTS.mystery;
  const weighted = eligible.map((c) => ({ card: c, w: weights[c.rarity ?? "Common"] ?? 1 }));
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let n = Math.random() * total;
  for (const { card, w } of weighted) {
    if ((n -= w) <= 0) return card;
  }
  return eligible[0];
}

function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  if (Number.isInteger(n)) return n.toString();
  return n < 1 ? n.toFixed(2) : n.toFixed(2);
}

function formatCooldown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function buildDiscoveries(packId: string): Discovery[] {
  const items: Discovery[] = [];
  // USDM roll (weighted by pack tier)
  const usdm = rollUsdm(packId);
  items.push({
    kind: "USDM",
    title: `${formatUsdm(usdm)} USDM`,
    sub: "Stablecoin on Celo",
    color: "oklch(0.75 0.2 145)",
    Icon: Wallet,
    rarity: usdm >= (Number(PACK_PRICE_USDM[packId]) || 0.05) * 2 ? "Legendary" : usdm >= (Number(PACK_PRICE_USDM[packId]) || 0.01) ? "Rare" : "Common",
    image: DISCOVERY_IMG.usdm,
    amountRaw: usdm,
  });
  // Fixed XP per pack — always awarded on a successful shred.
  const xpAmount = PACK_XP[packId] ?? 100;
  items.push({
    kind: "XP",
    title: `${xpAmount} XP`,
    sub: "Experience Points",
    color: "oklch(0.7 0.2 250)",
    Icon: Star,
    rarity: xpAmount >= 800 ? "Legendary" : xpAmount >= 400 ? "Epic" : xpAmount >= 200 ? "Rare" : "Common",
    image: DISCOVERY_IMG.xp,
    amountRaw: xpAmount,
  });
  // Card drop — weighted by pack tier.
  if (Math.random() < (PACK_CARD_CHANCE[packId] ?? 0.5)) {
    const card = pickCardForPack(packId);
    if (card) items.push({ ...card });
  }
  // Fact
  const fact = FACTS[Math.floor(Math.random() * FACTS.length)];
  items.push({
    kind: "FACT",
    title: "Did You Know?",
    sub: fact,
    color: "oklch(0.7 0.22 300)",
    Icon: Lightbulb,
    rarity: "Common",
    image: DISCOVERY_IMG.fact,
  });
  return items;
}

// Live event feed — populated from real activity (Supabase realtime).
// Starts empty; entries are prepended as they arrive.
type LiveEvent = { user: string; text: string; accent: string; from: string; wallet: string | null; avatar_url?: string | null };
const LIVE_EVENTS_SEED: LiveEvent[] = [];

type FeedRow = { username: string; wallet: string | null; pack_id: string | null; kind: string; text: string; amount: number | string | null };
function feedRowToEvent(r: FeedRow, avatarByWallet: Record<string, string>): LiveEvent {
  const username = r.username ? (r.username.startsWith("@") ? r.username : `@${r.username}`) : "@Shredder";
  const wallet = r.wallet ? r.wallet.toLowerCase() : null;
  const avatar_url = wallet ? avatarByWallet[wallet] : null;
  const base = { user: username, wallet, avatar_url } as const;
  if (r.kind === "USDM" || r.kind === "USDT") {
    const amt = typeof r.amount === "number" ? Number(r.amount) : r.amount ?? "";
    return { ...base, text: "just got", accent: `${amt} ${r.kind.toLowerCase()}`, from: r.pack_id ?? "Shreds" };
  }
  if (r.kind === "CARD") {
    const title = r.text?.replace(/^collected\s+/i, '') || r.kind;
    return { ...base, text: "collected", accent: title, from: r.pack_id ?? "Shreds" };
  }
  if (r.kind === "FACT") {
    const fact = r.text || "a fact";
    return { ...base, text: "discovered", accent: fact, from: r.pack_id ?? "Shreds" };
  }
  const [verb, ...rest] = (r.text || "").split(" ");
  return {
    ...base,
    text: verb || "shredded",
    accent: rest.join(" ") || r.kind,
    from: r.pack_id ?? "Shreds",
  };
}

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#4ade80,#22c55e)",
  "linear-gradient(135deg,#a78bfa,#7c3aed)",
  "linear-gradient(135deg,#fbbf24,#f59e0b)",
  "linear-gradient(135deg,#60a5fa,#2563eb)",
  "linear-gradient(135deg,#f472b6,#db2777)",
  "linear-gradient(135deg,#34d399,#0d9488)",
];

/* -------------------- Purchase helper -------------------- */
function isTxHash(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

async function buyPackOnChain(
  packId: string,
  walletAddress: string,
  getEth: () => unknown,
  onStatus?: (status: string) => void,
) {
  const eth = getEth() as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> } | null;
  if (!eth) throw new Error("No wallet");
  const { createWalletClient, createPublicClient, custom, http, parseUnits, keccak256, encodePacked } = await import("viem");
  const { celo } = await import("viem/chains");
  const client = createWalletClient({
    account: walletAddress as `0x${string}`,
    chain: celo,
    transport: custom(eth),
  });
  const publicClient = createPublicClient({ chain: celo, transport: http() });
  const price = parseUnits(PACK_PRICE_USDM[packId], 18);
  const orderId = keccak256(encodePacked(["address", "string", "uint256"], [walletAddress as `0x${string}`, packId, BigInt(Date.now())]));
  // Approve USDM then wait for confirmation
  onStatus?.("Confirm approval in MiniPay");
  const approveTx = await client.writeContract({
    address: USDM_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [PAYMENT_CONTRACT as `0x${string}`, price],
  });
  if (isTxHash(approveTx)) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash: approveTx });
    if (receipt.status !== "success") throw new Error("Approval was not confirmed. Please try again.");
  }
  let approved = false;
  for (let i = 0; i < 20; i += 1) {
    const allowance = (await publicClient.readContract({
      address: USDM_ADDRESS as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [walletAddress as `0x${string}`, PAYMENT_CONTRACT as `0x${string}`],
    })) as bigint;
    if (allowance >= price) {
      approved = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  if (!approved) throw new Error("Approval is still pending. Please wait a moment and try again.");
  // Buy pack and wait for confirmation before returning
  onStatus?.("Confirm pack purchase in MiniPay");
  const tx = await client.writeContract({
    address: PAYMENT_CONTRACT as `0x${string}`,
    abi: PAYMENT_ABI,
    functionName: "buyWithToken",
    args: [PACK_KEY[packId]!, USDM_ADDRESS as `0x${string}`, orderId],
  });
  onStatus?.("Confirming payment…");
  if (!isTxHash(tx)) {
    throw new Error("The wallet did not return a transaction hash. Please try again.");
  }
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  if (receipt.status !== "success") throw new Error("Payment transaction reverted");
  return { txHash: tx, orderId };
}

/* -------------------- Username helper -------------------- */
function getRpcUrl(): string {
  const env = import.meta.env as Record<string, unknown>;
  return (env.VITE_CELO_RPC_URL as string) || "https://forno.celo.org";
}

async function fetchUsernameOnChain(walletAddress: string): Promise<string | null> {
  try {
    const { createPublicClient, http } = await import("viem");
    const { celo } = await import("viem/chains");
    const publicClient = createPublicClient({ chain: celo, transport: http(getRpcUrl()) });
    const name = (await publicClient.readContract({
      address: USERNAME_CONTRACT as `0x${string}`,
      abi: USERNAME_ABI,
      functionName: "usernameOf",
      args: [walletAddress as `0x${string}`],
    })) as string;
    return name && name.length > 0 ? name : null;
  } catch (error) {
    console.warn("[username] on-chain fetch failed", { walletAddress, error });
    return null;
  }
}

/* -------------------- Home Screen -------------------- */

function HomeScreen() {
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"idle" | "slashing" | "shredded" | "revealing">("idle");
  const [reveals, setReveals] = useState<Discovery[]>([]);
  const [collection, setCollection] = useState<Discovery[]>([]);
  const [tickerIdx, setTickerIdx] = useState(0);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null);
  const [leaderboardRange, setLeaderboardRange] = useState<"daily" | "weekly" | "monthly" | "all">("weekly");
  const [starterCooldown, setStarterCooldown] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [starterCooldownUntil, setStarterCooldownUntil] = useState<number | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [purchaseStatus, setPurchaseStatus] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>(LIVE_EVENTS_SEED);
  const [packStats, setPackStats] = useState<Record<string, { owners: number; shreds: number; drops: number }>>({});
  const [globalStats, setGlobalStats] = useState<{ shredders: number; packs_shredded: number; discoveries: number; rewards_usdm: number }>({ shredders: 0, packs_shredded: 0, discoveries: 0, rewards_usdm: 0 });
  const [avatarByWallet, setAvatarByWallet] = useState<Record<string, string>>({});
  // Holds the on-chain orderId of the most-recently-verified paid purchase.
  // The current pack must match the pending payment so you cannot pay once
  // and open another paid pack for free.
  const pendingOrderRef = useRef<{ packId: Pack["id"]; orderId: string } | null>(null);
  const wallet = useWallet();
  const callDistribute = useServerFn(distributeReward);
  
  const callUpsertProfile = useServerFn(upsertProfile);
  const callGetMyProfile = useServerFn(getMyProfile);
  const callRecordShred = useServerFn(recordShred);
  const callListMyDiscoveries = useServerFn(listMyDiscoveries);
  const callGetStarterCooldown = useServerFn(getStarterCooldown);
  const callRecordPackPurchase = useServerFn(recordPackPurchase);
  const callFindUnclaimedPackPurchase = useServerFn(findUnclaimedPackPurchase);
  const callGetLeaderboard = useServerFn(getLeaderboard);
  const callGetStatsAndFeed = useServerFn(getStatsAndFeed);

  const refreshProfileAndLeaderboard = useCallback(async () => {
    try {
      if (wallet.address) {
        const [profile, discoveryRows, cooldown] = await Promise.all([
          callGetMyProfile({ data: { wallet: wallet.address } }),
          callListMyDiscoveries({ data: { wallet: wallet.address } }),
          callGetStarterCooldown({ data: { wallet: wallet.address } }),
        ]);
        const nextProfile = profile as { username?: string | null; wallet?: string | null; xp?: number | null; packs_shredded?: number | null; level?: number | null; avatar_url?: string | null } | null;

        if (nextProfile?.username) {
          setUsername(nextProfile.username);
        } else if (wallet.address) {
          const onchainName = await fetchUsernameOnChain(wallet.address);
          if (onchainName) {
            setUsername(onchainName);
            try {
              await callUpsertProfile({ data: { wallet: wallet.address, username: onchainName } });
            } catch (error) {
              console.warn("[profile] failed to persist on-chain username during refresh", { wallet: wallet.address, error });
            }
          } else {
            setUsername((prev) => {
              if (prev && nextProfile?.wallet?.toLowerCase() === wallet.address?.toLowerCase()) {
                return prev;
              }
              return null;
            });
          }
        } else {
          setUsername(null);
        }

        if (nextProfile) {
          const normalizedProfile = toStoredProfile(wallet.address, nextProfile);
          setProfileSummary(normalizedProfile);
        } else {
          setProfileSummary(null);
        }
        setCollection(((discoveryRows as Array<{ kind: string; title: string; sub: string; rarity?: string | null; amount?: number | null; tx_hash?: string | null; created_at?: string | null }> | undefined) ?? []).map(toUiDiscovery));
        const nextCooldown = cooldown as { active?: boolean; until?: string | null } | undefined;
        const untilMs = nextCooldown?.until ? new Date(nextCooldown.until).getTime() : 0;
        setStarterCooldown(!!nextCooldown?.active && untilMs > Date.now());
        setStarterCooldownUntil(nextCooldown?.active && untilMs > Date.now() ? untilMs : null);
      }
      const rows = await callGetLeaderboard({ data: { range: leaderboardRange } });
      const nextRows = (rows as LeaderboardRow[] | undefined) ?? [];
      setLeaderboard(nextRows);
    } catch (error) {
      console.error("[profile] failed to refresh database profile data", error);
    }
  }, [wallet.address, leaderboardRange, callGetMyProfile, callListMyDiscoveries, callGetStarterCooldown, callGetLeaderboard, callUpsertProfile]);

  const refreshStatsAndFeed = useCallback(async () => {
    try {
      const snapshot = await callGetStatsAndFeed({ data: {} });
      const nextSnapshot = snapshot as {
        packStats?: Record<string, { owners: number; shreds: number; drops: number }>;
        globalStats?: { shredders: number; packs_shredded: number; discoveries: number; rewards_usdm: number };
        avatarByWallet?: Record<string, string>;
        liveFeed?: Array<{ username: string; wallet: string | null; pack_id: string | null; kind: string; text: string; amount: number | string | null }>;
      };

      if (nextSnapshot.packStats && Object.keys(nextSnapshot.packStats).length > 0) {
        setPackStats(nextSnapshot.packStats);
      }

      if (nextSnapshot.globalStats) {
        setGlobalStats(nextSnapshot.globalStats);
      }

      const nextAvatarMap = nextSnapshot.avatarByWallet ?? {};
      setAvatarByWallet(nextAvatarMap);

      if (nextSnapshot.liveFeed) {
        const events = nextSnapshot.liveFeed.map((r) => feedRowToEvent(r, nextAvatarMap));
        setLiveEvents(events);
      }
    } catch (error) {
      console.error("[stats] failed to refresh shared stats", error);
    }
  }, [callGetStatsAndFeed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    [
      "shreds_username",
      "shreds_local_profiles",
      "shreds_local_pack_stats",
      "shreds_local_global_stats",
      "shreds_local_live_events",
      "shreds_local_collection",
    ].forEach((key) => window.localStorage.removeItem(key));
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith("shreds_starter_cd"))
      .forEach((key) => window.localStorage.removeItem(key));
    if (!localStorage.getItem("shreds_onboarded")) setShowOnboarding(true);
    const hasSeenAnnouncement = localStorage.getItem("shreds_announcement_seen");
    if (!hasSeenAnnouncement) setShowAnnouncement(true);
    setHydrated(true);
    // Warm image cache so packs & discoveries render instantly on first shred.
    const warm = [
      ...Object.values(PACK_IMG), ...Object.values(SHREDDED_IMG),
      ...Object.values(DISCOVERY_IMG), ...Object.values(CARD_LIBRARY),
      ...ONBOARDING_SLIDES,
    ];
    warm.forEach((src) => { const img = new Image(); img.src = src; });
  }, []);

  // Auto-detect existing on-chain username whenever wallet connects
  useEffect(() => {
    if (!wallet.address) return;
    let cancelled = false;
    const syncWalletProfile = async () => {
      const normalizedWallet = wallet.address.toLowerCase();
      const onchainName = await fetchUsernameOnChain(normalizedWallet);
      if (cancelled) return;

      try {
        if (onchainName) {
          setUsername(onchainName);
          await callUpsertProfile({ data: { wallet: wallet.address, username: onchainName } });
        } else {
          await callUpsertProfile({ data: { wallet: wallet.address } });
        }
      } catch (error) {
        console.warn("[profile] wallet sync failed", { wallet: normalizedWallet, error });
      }

      if (cancelled) return;
      await refreshProfileAndLeaderboard();
    };

    void syncWalletProfile();
    return () => { cancelled = true; };
  }, [wallet.address, refreshProfileAndLeaderboard, callUpsertProfile]);

  useEffect(() => {
    let cancelled = false;
    const runRefresh = async () => {
      if (cancelled) return;
      await refreshStatsAndFeed();
    };

    void runRefresh();
    const interval = window.setInterval(() => {
      void runRefresh();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [refreshStatsAndFeed]);

  useEffect(() => {
    if (!wallet.address) return;
    void refreshProfileAndLeaderboard();
  }, [leaderboardRange, wallet.address, refreshProfileAndLeaderboard]);

  useEffect(() => {
    if (!starterCooldownUntil) return;
    const interval = window.setInterval(() => {
      const remaining = starterCooldownUntil - Date.now();
      if (remaining <= 0) {
        setStarterCooldownUntil(null);
        setStarterCooldown(false);
        window.clearInterval(interval);
        return;
      }
      setStarterCooldown(true);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [starterCooldownUntil]);

  const finishOnboarding = () => {
    try { localStorage.setItem("shreds_onboarded", "1"); } catch { /* noop */ }
    setShowOnboarding(false);
  };

  const dismissAnnouncement = () => {
    try { localStorage.setItem("shreds_announcement_seen", "1"); } catch { /* noop */ }
    setShowAnnouncement(false);
  };

  const replayOnboarding = () => { setShowHelp(false); setShowOnboarding(true); };

  const onUsernameRegistered = (name: string) => {
    setUsername(name);
    setShowUsernameModal(false);
    if (wallet.address) {
      void callUpsertProfile({ data: { wallet: wallet.address, username: name } }).then(() => {
        void refreshProfileAndLeaderboard();
      }).catch(() => { /* non-fatal */ });
    }
    // continue to shredding flow
    setTimeout(() => { void startShredInner(); }, 200);
  };

  const pack = PACKS[index];
  const starterCooldownLabel = starterCooldownUntil ? `Next free shred in ${formatCooldown(Math.max(0, starterCooldownUntil - Date.now()))}` : null;

  useEffect(() => {
    if (liveEvents.length < 2) return;
    const t = setInterval(() => setTickerIdx((i) => (i + 1) % liveEvents.length), 3500);
    return () => clearInterval(t);
  }, [liveEvents.length]);

  const goPrev = () => setIndex((i) => (i - 1 + PACKS.length) % PACKS.length);
  const goNext = () => setIndex((i) => (i + 1) % PACKS.length);

  const executeShred = useCallback(() => {
    if (phase !== "idle") return;
    if (pack.id === "starter" && starterCooldown) {
      setBuyError("The free Starter Pack is on a 12-hour cooldown. Come back later for another free shred.");
      return;
    }
    if (pack.priceNum > 0 && pendingOrderRef.current?.packId !== pack.id) {
      setBuyError("Please complete payment before opening this paid pack.");
      return;
    }

    const items = buildDiscoveries(pack.id);
    setReveals(items);
    audio.duckTheme();
    audio.playShred();
    setPhase("slashing");
    setTimeout(() => setPhase("shredded"), 700);
    setTimeout(() => {
      setPhase("revealing");

      // Persist first, then reload profile/leaderboard/stats/feed from the database.
      const feedItems = items.map((i) => ({
        kind: i.kind,
        title: i.title,
        sub: i.sub,
        rarity: i.rarity,
        amount: i.amountRaw,
      }));
      const label = username && username.length > 0 ? username : undefined;
      void (async () => {
        try {
          if (!wallet.address) throw new Error("Connect your wallet before shredding.");
          console.info("[shred] ✓ Saving reward to database", { packId: pack.id, wallet: wallet.address });
          await callRecordShred({ data: { wallet: wallet.address, username: label, packId: pack.id as "starter" | "mystery" | "alpha" | "legendary" | "explorer", items: feedItems } });
          console.info("[shred] ✓ Reward saved", { packId: pack.id });

          if (pack.id === "starter") {
            const until = Date.now() + STARTER_PACK_COOLDOWN_MS;
            setStarterCooldownUntil(until);
            setStarterCooldown(true);
          }

          // Automatically transfer USDM reward from the rewarder wallet after
          // the shred is saved, so failed/duplicate saves cannot trigger payout.
          const usdmItem = items.find((i) => i.kind === "USDM");
          const usdmAmount = typeof usdmItem?.amountRaw === "number" ? usdmItem.amountRaw : 0;
          const isPaidPack = pack.priceNum > 0;
          const orderId = pendingOrderRef.current?.orderId;

          if (usdmAmount > 0) {
            const nonce = `${wallet.address.toLowerCase()}-${pack.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            const rewardData = {
              wallet: wallet.address,
              packId: pack.id as "starter" | "mystery" | "alpha" | "legendary" | "explorer",
              amountUsdm: usdmAmount,
              nonce,
              ...(isPaidPack && orderId ? { orderId } : {}),
            };

            if (isPaidPack) {
              if (!orderId) {
                throw new Error("Paid packs must have a verified orderId before opening.");
              }
              pendingOrderRef.current = null;
              console.info("[reward] ✓ Claiming paid pack purchase", { packId: pack.id, amountUsdm: usdmAmount, orderId });
            } else {
              console.info("[reward] ✓ Sending starter reward", { packId: pack.id, amountUsdm: usdmAmount });
            }

            const result = await callDistribute({ data: rewardData });
            if (!result.ok) {
              console.error("[reward] distributeReward failed", result);
              setBuyError(result.error === "treasury_underfunded"
                ? "Reward payout is queued: the reward contract needs more USDM funding."
                : (result.error ? `Reward payout failed: ${String(result.error).slice(0, 120)}` : "Reward payout failed. Check server logs for details."));
            } else {
              console.info("[reward] ✓ Success", result);
              setBuyError(null);
            }
          }
        } catch (error) {
          console.error("[shred] database save or reward payout failed", error);
          const message = (error as Error)?.message || String(error);
          setBuyError(message.slice(0, 180));
        } finally {
          void refreshProfileAndLeaderboard();
          void refreshStatsAndFeed();
        }
      })();


    }, 1700);
  }, [phase, pack.id, username, wallet.address, starterCooldown, callDistribute, callRecordShred, refreshProfileAndLeaderboard, refreshStatsAndFeed]);

  const startShredInner = useCallback(async () => {
    if (pack.id === "starter" && starterCooldown) {
      setBuyError("The free Starter Pack is on a 12-hour cooldown. Come back later for another free shred.");
      return;
    }
    if (!wallet.address) {
      const acct = await wallet.connect();
      if (!acct) {
        setBuyError("Connect your wallet to receive USDM rewards.");
        return;
      }
    }
    // If paid, require a fresh purchase every time before opening.
    if (pack.priceNum > 0) {
      setBuying(true);
      setBuyError(null);
      setPurchaseStatus("Preparing payment…");

      if (wallet.chainId !== CELO_CHAIN_ID) {
        setBuyError("Switching to Celo network…");
        const acct = await wallet.connect();
        if (!acct || wallet.chainId !== CELO_CHAIN_ID) {
          setBuyError("Please switch your wallet to the Celo network to continue.");
          setBuying(false);
          return;
        }
        setBuyError(null);
      }

      try {
        const purchase = await buyPackOnChain(pack.id, wallet.address!, wallet.getEth, setPurchaseStatus);
        setPurchaseStatus("Recording purchase…");
        await callRecordPackPurchase({
          data: {
            wallet: wallet.address!,
            packId: pack.id as "starter" | "mystery" | "alpha" | "legendary" | "explorer",
            orderId: purchase.orderId,
            txHash: purchase.txHash,
            priceUsdm: pack.priceNum,
          },
        });
        pendingOrderRef.current = { packId: pack.id, orderId: purchase.orderId };
        setPurchaseStatus("Payment confirmed. Opening pack…");
        setBuying(false);
        executeShred();
      } catch (e: unknown) {
        setBuying(false);
        setPurchaseStatus(null);
        setBuyError((e as Error)?.message?.slice(0, 80) || "Purchase failed.");
      }
      return;
    }

    executeShred();
  }, [pack, wallet, starterCooldown, executeShred, callRecordPackPurchase]);

  const startShred = useCallback(async () => {
    if (pack.id === "starter" && starterCooldown) {
      setBuyError("The free Starter Pack is on a 12-hour cooldown. Come back later for another free shred.");
      return;
    }
    // First-time shredders must register a username before the flow continues.
    if (!username) {
      if (!wallet.address) {
        await wallet.connect();
      }
      setShowUsernameModal(true);
      return;
    }
    if (!wallet.address) {
      const acct = await wallet.connect();
      if (!acct) {
        setBuyError("Connect your wallet to receive USDM rewards.");
        return;
      }
    }
    await startShredInner();
  }, [username, wallet, startShredInner]);


  const closeReveal = () => { setPhase("idle"); setReveals([]); audio.restoreTheme(); };

  return (
    <div className="min-h-dvh w-full text-foreground pb-20">
      <div className="mx-auto w-full max-w-md px-3 pt-3">
        {/* Header */}
        <header className="grid grid-cols-[68px_1fr_88px] items-center gap-2">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowLeaderboard(true)}
              className="flex flex-col items-center gap-0.5 group"
              aria-label="Leaderboard"
            >
              <div className="icon-tile w-9 h-9 rounded-lg flex items-center justify-center group-active:scale-95 transition">
                <Trophy className="w-4 h-4 text-[color:var(--gold)]" />
              </div>
              <span className="text-[7px] font-semibold tracking-[0.16em] text-muted-foreground">LEADER</span>
            </button>
            <button
              onClick={() => setShowHelp(true)}
              className="flex flex-col items-center gap-0.5 group"
              aria-label="Help & FAQ"
            >
              <div className="icon-tile w-9 h-9 rounded-lg flex items-center justify-center group-active:scale-95 transition">
                <HelpCircle className="w-4 h-4 text-shred" />
              </div>
              <span className="text-[7px] font-semibold tracking-[0.16em] text-muted-foreground">HELP</span>
            </button>
          </div>

          <div className="flex flex-col items-center justify-center min-w-0 gap-0.5">
            <img
              src={WORDMARK_SRC}
              alt="Shreds"
              className="h-7 w-auto max-w-full object-contain drop-shadow-[0_0_18px_oklch(0.88_0.28_135/0.6)]"
            />
            <div className="text-[7px] font-bold tracking-[0.18em] whitespace-nowrap">
              <span className="text-foreground">DISCOVER. </span>
              <span className="text-shred">COLLECT. </span>
              <span className="text-[color:var(--gold)]">EARN.</span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-1.5">
            <div className="flex flex-col items-center gap-0.5">
              <BackgroundMusic bare />
              <span className="text-[7px] font-semibold tracking-[0.16em] text-muted-foreground">MUSIC</span>
            </div>
            <button
              onClick={() => setShowProfile(true)}
              className="flex flex-col items-center gap-0.5 group"
              aria-label="Profile"
            >
              <div className="icon-tile w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden group-active:scale-95 transition">
                {profileSummary?.avatar_url ? (
                  <img src={profileSummary.avatar_url} alt="You" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ background: AVATAR_GRADIENTS[0] }}>
                    <User className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
              <span className="text-[7px] font-semibold tracking-[0.16em] text-muted-foreground">PROFILE</span>
            </button>
          </div>
        </header>

        {/* Stats row — live production counters */}
        <div className="mt-2 stat-card rounded-lg px-1.5 py-1 grid grid-cols-4 gap-0.5">
          <StatCompact icon={<Users className="w-3 h-3 text-shred" />} value={fmtNum(globalStats.shredders)} label="SHREDDERS" />
          <StatCompact icon={<Package className="w-3 h-3 text-[color:oklch(0.7_0.18_240)]" />} value={fmtNum(globalStats.packs_shredded)} label="SHREDDED" />
          <StatCompact icon={<Gem className="w-3 h-3 text-[color:var(--royal)]" />} value={fmtNum(globalStats.discoveries)} label="DISCOVER" />
          <StatCompact icon={<Wallet className="w-3 h-3 text-[color:var(--gold)]" />} value={`$${fmtNum(globalStats.rewards_usdm)}`} label="REWARDS" />
        </div>

        {/* Pack carousel */}
        <PackCarousel
          index={index}
          onPrev={goPrev}
          onNext={goNext}
          onShred={startShred}
          phase={phase}
          buying={buying}
          purchaseStatus={purchaseStatus}
          needsPurchase={pack.priceNum > 0}
        />

        {/* Pack details — live per-pack counters */}
        <div className="mt-2 grid grid-cols-4 gap-1">
          <MiniStat Icon={Star} value={pack.price} label="PRICE" tint="oklch(0.88 0.28 135)" />
          <MiniStat Icon={Users} value={fmtNum(packStats[pack.id]?.owners ?? 0)} label="OWNERS" tint="oklch(0.7 0.2 145)" />
          <MiniStat Icon={Flame} value={fmtNum(packStats[pack.id]?.shreds ?? 0)} label="SHREDS" tint="oklch(0.75 0.2 45)" />
          <MiniStat Icon={Gift} value={fmtNum(packStats[pack.id]?.drops ?? 0)} label="DROPS" tint="oklch(0.68 0.22 300)" />
        </div>


        {/* Dots */}
        <div className="mt-3 flex items-center justify-center gap-2">
          {PACKS.map((p, i) => (
            <button
              key={p.id}
              onClick={() => setIndex(i)}
              aria-label={`Go to ${p.name}`}
              className="h-2 rounded-full transition-all"
              style={{
                width: i === index ? 22 : 8,
                background: i === index ? pack.accent : "oklch(0.35 0.02 150)",
                boxShadow: i === index ? `0 0 12px ${pack.glow}` : "none",
              }}
            />
          ))}
        </div>

        {/* Hint */}
        <div className="mt-2 text-center">
          <div className="font-display text-lg text-shred text-glow-shred leading-none">SLASH TO SHRED</div>
          <div className="text-[8px] tracking-[0.2em] font-semibold text-muted-foreground mt-0.5">REVEAL YOUR DISCOVERIES</div>
          {starterCooldown && starterCooldownLabel && (
            <div className="mt-1 text-[10px] font-semibold tracking-[0.16em] text-[color:var(--gold)]">{starterCooldownLabel.toUpperCase()}</div>
          )}
        </div>

        {buyError && (
          <div className="mt-2 text-center text-[10px] text-destructive flex items-center justify-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {buyError}
          </div>
        )}
        {!buyError && buying && purchaseStatus && (
          <div className="mt-2 text-center text-[10px] text-shred flex items-center justify-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> {purchaseStatus}
          </div>
        )}

        {/* Wallet chip */}
        <div className="mt-3 flex justify-center">
          <button
            onClick={wallet.status === "connected" ? undefined : () => { void wallet.connect(); }}
            className="stat-card rounded-full px-3 py-1.5 text-[11px] font-semibold flex items-center gap-2 active:scale-95 transition"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${wallet.status === "connected" ? "bg-shred" : "bg-muted-foreground"} animate-pulse`} />
            {wallet.status === "connected" && <>{wallet.isMiniPay ? "MiniPay" : "Wallet"} · {shortAddr(wallet.address)}</>}
            {wallet.status === "connecting" && <>Connecting…</>}
            {wallet.status === "unavailable" && <>Tap to connect wallet</>}
            {wallet.status === "idle" && <>Initializing…</>}
          </button>
        </div>
      </div>

      {liveEvents.length > 0 && <LiveTicker event={liveEvents[tickerIdx]} idx={tickerIdx} />}

      {phase !== "idle" && (
        <RevealOverlay phase={phase} reveals={reveals} pack={pack} onClose={closeReveal} />
      )}

      {showLeaderboard && <LeaderboardSheet leaderboard={leaderboard} range={leaderboardRange} onRangeChange={setLeaderboardRange} onClose={() => setShowLeaderboard(false)} />}
      {showProfile && (
        <ProfileSheet
          onClose={() => setShowProfile(false)}
          wallet={wallet.address}
          collection={collection}
          username={username}
          summary={profileSummary}
          onRegister={() => { setShowProfile(false); setShowUsernameModal(true); }}
          onAvatarChange={async (dataUrl) => {
            if (!wallet.address) return;
            setProfileSummary((prev) => prev ? { ...prev, avatar_url: dataUrl } : prev);
            try {
              await callUpsertProfile({ data: { wallet: wallet.address, avatar_url: dataUrl } });
              void refreshProfileAndLeaderboard();
              void refreshStatsAndFeed();
            } catch (e) {
              console.error("[profile] avatar upload failed", e);
            }
          }}
        />
      )}
      {showAnnouncement && <AnnouncementOverlay onClose={dismissAnnouncement} />}
      {showOnboarding && <OnboardingOverlay onDone={finishOnboarding} />}
      {showHelp && <HelpSheet onClose={() => setShowHelp(false)} onReplay={replayOnboarding} />}
      {showUsernameModal && (
        <UsernameModal
          walletAddress={wallet.address}
          onConnect={() => wallet.connect()}
          onClose={() => setShowUsernameModal(false)}
          onRegistered={onUsernameRegistered}
          getEth={wallet.getEth}
        />
      )}
      
    </div>
  );
}

/* -------------------- Small pieces -------------------- */

function StatCompact({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center min-w-0 px-0.5 py-0.5">
      <div className="flex items-center gap-0.5 min-w-0">
        <div className="shrink-0">{icon}</div>
        <div className="font-bold text-[10px] leading-none truncate">{value}</div>
      </div>
      <div className="text-[7px] font-bold tracking-[0.12em] text-muted-foreground mt-0.5 truncate w-full">{label}</div>
    </div>
  );
}

function MiniStat({ Icon, value, label, tint }: { Icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>; value: string; label: string; tint: string }) {
  return (
    <div className="stat-card rounded-md px-1 py-1 flex flex-col items-center text-center min-w-0">
      <Icon className="w-3 h-3 shrink-0" style={{ color: tint }} />
      <div className="font-bold text-[10px] leading-tight mt-0.5 truncate w-full">{value}</div>
      <div className="text-[7px] font-bold tracking-[0.12em] text-muted-foreground truncate w-full">{label}</div>
    </div>
  );
}

/* -------------------- Pack Carousel -------------------- */

function PackCarousel({
  index, onPrev, onNext, onShred, phase, buying, purchaseStatus, needsPurchase,
}: {
  index: number; onPrev: () => void; onNext: () => void; onShred: () => void;
  phase: "idle" | "slashing" | "shredded" | "revealing"; buying: boolean; purchaseStatus: string | null; needsPurchase: boolean;
}) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const [slash, setSlash] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const prev = PACKS[(index - 1 + PACKS.length) % PACKS.length];
  const next = PACKS[(index + 1) % PACKS.length];
  const pack = PACKS[index];

  function onPointerDown(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!start.current) return;
    const s = start.current;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const dt = Date.now() - s.t;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    start.current = null;
    if (phase !== "idle" || buying) return;
    const dist = Math.hypot(dx, dy);
    if (dist > 90 && dt < 700 && absY > 20 && absX > 40 && absX / absY < 4) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setSlash({
          x1: s.x - rect.left,
          y1: s.y - rect.top,
          x2: e.clientX - rect.left,
          y2: e.clientY - rect.top,
        });
      }
      onShred();
      setTimeout(() => setSlash(null), 1000);
      return;
    }
    if (absX > absY && absX > 50) { dx < 0 ? onNext() : onPrev(); }
  }

  const showShredded = phase === "shredded" || phase === "revealing";
  const imgSrc = showShredded ? pack.shredded : pack.image;

  return (
    <div
      ref={containerRef}
      className="relative mt-2 h-[54vh] min-h-[380px] max-h-[560px] select-none touch-none"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <PackImage pack={prev} className="absolute left-[-38%] top-1/2 -translate-y-1/2 h-[62%] opacity-40 blur-[1px]" />
      <PackImage pack={next} className="absolute right-[-38%] top-1/2 -translate-y-1/2 h-[62%] opacity-40 blur-[1px]" />

      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-full w-full flex items-center justify-center float-y">
          <div
            className="absolute inset-0 rounded-[40%] blur-3xl opacity-70"
            style={{ background: `radial-gradient(ellipse at center, ${pack.glow}, transparent 60%)` }}
          />
          <img
            src={imgSrc}
            alt={pack.name}
            draggable={false}
            className={`relative h-full w-auto drop-shadow-[0_20px_40px_rgba(0,0,0,0.6)] transition-transform duration-300 ${phase === "slashing" ? "scale-110" : ""}`}
          />
          {slash && (
            <svg className="claw absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${containerRef.current?.clientWidth ?? 300} ${containerRef.current?.clientHeight ?? 440}`}>
              {[-16, 0, 16].map((off, i) => {
                const nx = -(slash.y2 - slash.y1);
                const ny = slash.x2 - slash.x1;
                const len = Math.hypot(nx, ny) || 1;
                const ox = (nx / len) * off, oy = (ny / len) * off;
                return (
                  <path
                    key={i}
                    d={`M ${slash.x1 + ox} ${slash.y1 + oy} L ${slash.x2 + ox} ${slash.y2 + oy}`}
                    stroke="oklch(0.92 0.3 130)"
                    strokeWidth={i === 1 ? 7 : 5}
                    strokeLinecap="round"
                    fill="none"
                  />
                );
              })}
            </svg>
          )}
          {buying && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="flex flex-col items-center gap-2 text-center px-4">
                <Loader2 className="w-7 h-7 text-shred animate-spin" />
                <div className="font-display text-xl text-white animate-pulse">{purchaseStatus ?? "Purchasing…"}</div>
              </div>
            </div>
          )}
          {needsPurchase && !buying && phase === "idle" && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-shred text-primary-foreground font-bold text-[10px] tracking-wider px-3 py-1 rounded-full shadow-lg">
              BUY & SHRED
            </div>
          )}
        </div>
      </div>

      <button
        onClick={onPrev}
        aria-label="Previous pack"
        className="absolute left-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full stat-card flex items-center justify-center active:scale-95"
      >
        <ChevronLeft className="w-5 h-5 text-shred" />
      </button>
      <button
        onClick={onNext}
        aria-label="Next pack"
        className="absolute right-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full stat-card flex items-center justify-center active:scale-95"
      >
        <ChevronRight className="w-5 h-5 text-shred" />
      </button>
    </div>
  );
}

function PackImage({ pack, className }: { pack: Pack; className?: string }) {
  return <img src={pack.image} alt={pack.name} draggable={false} className={className} />;
}

/* -------------------- Reveal Overlay -------------------- */

const RARITY_COLOR: Record<string, string> = {
  Common: "oklch(0.7 0.05 150)",
  Uncommon: "oklch(0.78 0.18 145)",
  Rare: "oklch(0.7 0.2 250)",
  Epic: "oklch(0.7 0.22 300)",
  Legendary: "oklch(0.82 0.17 85)",
  Mythic: "oklch(0.75 0.25 350)",
};

function RevealOverlay({ phase, reveals, pack, onClose }: {
  phase: "slashing" | "shredded" | "revealing" | "idle"; reveals: Discovery[]; pack: Pack; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-background/85 backdrop-blur-md flex flex-col items-center justify-center px-4 overflow-y-auto py-8">
      {phase === "slashing" && (
        <div className="font-display text-4xl text-shred text-glow-shred animate-pulse">SLASHING…</div>
      )}
      {phase === "shredded" && (
        <div className="flex flex-col items-center gap-4">
          <img src={pack.shredded} alt={pack.name + " shredded"} className="h-[45vh] object-contain drop-shadow-2xl" />
          <div className="font-display text-2xl text-shred text-glow-shred">SHREDDED!</div>
        </div>
      )}
      {phase === "revealing" && (
        <div className="w-full max-w-md">
          <div className="text-center mb-5">
            <div className="text-[10px] tracking-[0.3em] font-bold text-muted-foreground">FROM {pack.name.toUpperCase()}</div>
            <div className="font-display text-3xl text-shred text-glow-shred mt-1">YOUR DISCOVERIES</div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {reveals.map((d, i) => (
              <div
                key={i}
                className="reveal-pop rounded-2xl p-4 flex items-center gap-3 relative overflow-hidden"
                style={{
                  animationDelay: `${i * 160}ms`,
                  background: `linear-gradient(135deg, oklch(0.22 0.04 150 / 90%), oklch(0.14 0.02 150 / 95%))`,
                  border: `1px solid ${d.color}`,
                  boxShadow: `0 0 24px ${d.color.replace(")", " / 30%)")}`,
                }}
              >
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 overflow-hidden"
                  style={{
                    background: `radial-gradient(circle, ${d.color.replace(")", " / 55%)")}, transparent 70%)`,
                    border: `1px solid ${d.color.replace(")", " / 50%)")}`,
                  }}
                >
                  {d.image ? (
                    <img src={d.image} alt={d.title} className="w-full h-full object-contain" />
                  ) : (
                    <d.Icon className="w-7 h-7" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="font-bold text-base leading-tight">{d.title}</div>
                    {d.rarity && (
                      <span
                        className="text-[9px] font-bold tracking-widest px-1.5 py-0.5 rounded"
                        style={{
                          color: RARITY_COLOR[d.rarity],
                          border: `1px solid ${RARITY_COLOR[d.rarity]}`,
                        }}
                      >{d.rarity.toUpperCase()}</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 leading-snug">{d.sub}</div>
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={onClose}
            className="mt-6 w-full py-3 rounded-2xl font-bold tracking-wider bg-shred text-primary-foreground active:scale-[0.98] glow-shred"
          >
            COLLECT &amp; CONTINUE
          </button>
        </div>
      )}
    </div>
  );
}

/* -------------------- Live Ticker -------------------- */

function LiveTicker({ event, idx }: { event: LiveEvent; idx: number }) {
  return (
    <div className="fixed bottom-2 inset-x-0 flex justify-center px-2 z-30 pointer-events-none">
      <div key={idx} className="ticker-in stat-card rounded-full px-2.5 py-1 flex items-center gap-1.5 w-full max-w-md pointer-events-auto">
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-shred/15 text-shred text-[9px] font-bold tracking-wider shrink-0">
          <span className="w-1 h-1 rounded-full bg-shred animate-pulse" /> LIVE
        </div>
        <div
          className="w-5 h-5 rounded-full shrink-0 overflow-hidden"
          style={{ background: AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length] }}
        >
          {event.avatar_url && <img src={event.avatar_url} alt="" className="w-full h-full object-cover" />}
        </div>
        <div className="text-[10px] flex-1 truncate min-w-0">
          <span className="font-bold">{event.user}</span>{" "}
          <span className="text-muted-foreground">{event.text}</span>{" "}
          <span className="font-bold text-shred">{event.accent}</span>
        </div>
        <Zap className="w-3 h-3 text-shred shrink-0" />
      </div>
    </div>
  );
}

/* -------------------- Leaderboard -------------------- */

function LeaderboardSheet({ leaderboard, range, onRangeChange, onClose }: { leaderboard: LeaderboardRow[]; range: "daily" | "weekly" | "monthly" | "all"; onRangeChange: (range: "daily" | "weekly" | "monthly" | "all") => void; onClose: () => void }) {
  const tabs = ["Daily", "Weekly", "Monthly", "All Time"] as const;
  const tabMap: Record<(typeof tabs)[number], "daily" | "weekly" | "monthly" | "all"> = {
    Daily: "daily",
    Weekly: "weekly",
    Monthly: "monthly",
    "All Time": "all",
  };

  return (
    <Sheet title="Leaderboard" onClose={onClose} Icon={Trophy}>
      <div className="flex gap-1.5 mb-4">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => onRangeChange(tabMap[t])}
            className={`flex-1 py-2 rounded-xl text-[10px] font-bold tracking-wider transition ${range === tabMap[t] ? "bg-shred text-primary-foreground glow-shred" : "stat-card text-muted-foreground"}`}
          >{t.toUpperCase()}</button>
        ))}
      </div>
      {leaderboard.length === 0 ? (
        <EmptyState text="No rankings yet. Be the first to shred and claim the top spot." />
      ) : (
        <div className="space-y-2">
          {leaderboard.map((row, index) => (
            <div key={`${row.wallet ?? row.username ?? index}`} className="stat-card rounded-xl px-2.5 py-2 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] bg-shred/15 text-shred shrink-0">#{index + 1}</div>
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0" style={{ background: AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length] }}>
                {row.avatar_url ? (
                  <img src={row.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{row.username ? `@${row.username}` : shortAddr(row.wallet)}</div>
                <div className="text-[10px] text-muted-foreground">{row.packs_shredded} packs · {row.xp} XP</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

/* -------------------- Profile -------------------- */

function ProfileSheet({ onClose, wallet, collection, username, summary, onRegister, onAvatarChange }: {
  onClose: () => void; wallet: string | null; collection: Discovery[];
  username: string | null; summary: ProfileSummary | null; onRegister: () => void;
  onAvatarChange: (dataUrl: string) => void | Promise<void>;
}) {
  const cards = collection.filter(c => c.kind === "CARD");
  const facts = collection.filter(c => c.kind === "FACT");
  const stables = collection.filter(c => c.kind === "USDM");
  const [tab, setTab] = useState<"CARDS" | "FACTS" | "REWARDS">("CARDS");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarUrl = summary?.avatar_url ?? null;

  const handleAvatarFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\//.test(file.type)) { setAvatarError("Please choose an image file."); return; }
    if (file.size > 8 * 1024 * 1024) { setAvatarError("Image too large (max 8MB)."); return; }
    setAvatarError(null);
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
      });
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d")!;
      // cover-fit crop
      const scale = Math.max(size / img.width, size / img.height);
      const dw = img.width * scale, dh = img.height * scale;
      ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
      const jpg = canvas.toDataURL("image/jpeg", 0.82);
      await onAvatarChange(jpg);
    } catch (err) {
      setAvatarError((err as Error)?.message?.slice(0, 100) || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet title="Profile" onClose={onClose} Icon={User}>
      <div className="stat-card rounded-2xl p-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="relative w-16 h-16 rounded-2xl shrink-0 overflow-hidden active:scale-95 transition"
          style={!avatarUrl ? { background: AVATAR_GRADIENTS[0] } : undefined}
          aria-label="Change avatar"
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="Your avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 bg-black/55 flex items-center justify-center py-0.5">
            {uploading ? (
              <Loader2 className="w-3 h-3 text-white animate-spin" />
            ) : (
              <Camera className="w-3 h-3 text-white" />
            )}
          </div>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarFile}
        />
        <div className="flex-1 min-w-0">
          <div className="font-display text-xl truncate">{username ? `@${username}` : "UNCLAIMED"}</div>
          {!username && wallet && (
            <div className="text-[11px] text-muted-foreground truncate">{shortAddr(wallet)}</div>
          )}
          {!wallet && (
            <div className="text-[11px] text-muted-foreground truncate">Wallet not connected</div>
          )}
          {avatarError && <div className="text-[10px] text-destructive mt-1">{avatarError}</div>}
          {(() => {
            const xp = summary?.xp ?? collection.filter(c => c.kind === "XP").reduce((s, c) => s + (c.amountRaw ?? 0), 0);
            const level = summary?.level ?? Math.max(1, Math.floor(xp / 500) + 1);
            const into = xp % 500;
            return (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <div className="px-2 py-0.5 rounded-full bg-shred/15 text-shred text-[10px] font-bold tracking-wider">LVL {level}</div>
                  <div className="text-[11px] text-muted-foreground">{into.toLocaleString()} / 500 XP</div>
                </div>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                  <div className="h-full bg-shred glow-shred" style={{ width: `${(into / 500) * 100}%` }} />
                </div>
              </>
            );
          })()}
        </div>
      </div>

      {!username && (
        <button
          onClick={onRegister}
          className="mt-3 w-full py-3 rounded-2xl bg-shred text-primary-foreground font-bold text-xs tracking-widest glow-shred active:scale-[0.98] flex items-center justify-center gap-2"
        >
          <Award className="w-4 h-4" /> REGISTER YOUR USERNAME
        </button>
      )}

      <div className="grid grid-cols-3 gap-2 mt-4">
        <ProfileStat label="PACKS" value={String(collection.length ? Math.ceil(collection.length / 3) : 0)} />
        <ProfileStat label="CARDS" value={String(cards.length)} />
        <ProfileStat label="FACTS" value={String(facts.length)} />
      </div>

      <div className="flex gap-1.5 mt-5 mb-3">
        {(["CARDS", "FACTS", "REWARDS"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-[10px] font-bold tracking-wider transition ${tab === t ? "bg-shred text-primary-foreground glow-shred" : "stat-card text-muted-foreground"}`}
          >{t}</button>
        ))}
      </div>

      {tab === "CARDS" && (
        cards.length === 0 ? (
          <EmptyState text="No cards yet. Shred a pack to start your collection." />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {cards.map((c, i) => (
              <div key={i} className="rounded-xl p-3 flex flex-col items-center text-center"
                style={{
                  background: `linear-gradient(180deg, oklch(0.22 0.04 150 / 90%), oklch(0.14 0.02 150 / 95%))`,
                  border: `1px solid ${c.color}`,
                  boxShadow: `0 0 18px ${c.color.replace(")", " / 25%)")}`,
                }}>
                <div className="w-full aspect-[3/4] rounded-lg overflow-hidden flex items-center justify-center mb-1.5"
                  style={{ background: `radial-gradient(circle, ${c.color.replace(")", " / 45%)")}, transparent 70%)` }}>
                  {c.image ? (
                    <img src={c.image} alt={c.title} className="w-full h-full object-cover" />
                  ) : (
                    <c.Icon className="w-8 h-8" />
                  )}
                </div>
                <div className="font-bold text-xs leading-tight">{c.title}</div>
                {c.rarity && (
                  <div className="text-[9px] font-bold tracking-widest mt-1"
                    style={{ color: RARITY_COLOR[c.rarity] }}>{c.rarity.toUpperCase()}</div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {tab === "FACTS" && (
        facts.length === 0 ? (
          <EmptyState text="No facts collected yet. Every shred teaches you something new." />
        ) : (
          <div className="space-y-2">
            {facts.map((f, i) => (
              <div key={i} className="stat-card rounded-xl p-3 flex gap-3">
                <img src={DISCOVERY_IMG.fact} alt="" className="w-10 h-10 object-contain shrink-0" />
                <div className="text-xs leading-snug">{f.sub}</div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === "REWARDS" && (
        stables.length === 0 ? (
          <EmptyState text="No stablecoin rewards yet. Shred a pack to earn USDM." />
        ) : (
          <div className="space-y-2">
            {stables.map((s, i) => (
              <div key={i} className="stat-card rounded-xl p-3 flex items-center gap-3">
                <img src={DISCOVERY_IMG.usdm} alt="" className="w-10 h-10 object-contain shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate">{s.title}</div>
                  {s.txHash ? (
                    <a
                      href={`https://celoscan.io/tx/${s.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-shred flex items-center gap-1 mt-0.5 truncate"
                    >
                      <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                      <span className="truncate">{s.txHash.slice(0, 10)}…{s.txHash.slice(-6)}</span>
                    </a>
                  ) : (
                    <div className="text-[10px] text-muted-foreground mt-0.5">Payout pending…</div>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground tracking-widest shrink-0">{s.sub}</div>
              </div>
            ))}
          </div>
        )
      )}
    </Sheet>
  );
}

function ProfileStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card rounded-xl p-3 text-center">
      <div className="font-display text-xl">{value}</div>
      <div className="text-[9px] tracking-widest font-bold text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="stat-card rounded-2xl p-6 text-center text-xs text-muted-foreground">
      <Gift className="w-8 h-8 mx-auto mb-2 opacity-60" />
      {text}
    </div>
  );
}

/* -------------------- Sheet -------------------- */

function Sheet({ title, onClose, children, Icon }: { title: string; onClose: () => void; children: React.ReactNode; Icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="fixed inset-0 z-50 bg-background/85 backdrop-blur-md flex items-end sm:items-center justify-center">
      <div className="w-full max-w-md max-h-[92dvh] overflow-y-auto no-scrollbar rounded-t-3xl sm:rounded-3xl bg-card border border-border p-4 reveal-pop">
        <div className="flex items-center justify-between mb-4 sticky top-0 bg-card pb-2 z-10">
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="w-5 h-5 text-shred shrink-0" />
            <h2 className="font-display text-2xl truncate">{title.toUpperCase()}</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full stat-card flex items-center justify-center shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* -------------------- Onboarding (uploaded image slides) -------------------- */

const ONBOARDING_SLIDES = [onboarding1.url, onboarding2.url, onboarding3.url, onboarding4.url];

function OnboardingOverlay({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const startRef = useRef<{ x: number; t: number } | null>(null);
  const last = step === ONBOARDING_SLIDES.length - 1;

  const onDown = (e: React.PointerEvent) => { startRef.current = { x: e.clientX, t: Date.now() }; };
  const onUp = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    startRef.current = null;
    if (Math.abs(dx) > 40) {
      if (dx < 0 && !last) setStep(step + 1);
      if (dx > 0 && step > 0) setStep(step - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-background flex items-center justify-center">
      <div
        className="relative w-full h-full max-w-md mx-auto flex flex-col select-none touch-none"
        onPointerDown={onDown}
        onPointerUp={onUp}
      >
        <img
          src={ONBOARDING_SLIDES[step]}
          alt={`Onboarding ${step + 1}`}
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
        />
        <div className="mt-auto pb-6 pt-4 px-5 z-10 relative flex gap-2 bg-gradient-to-t from-background via-background/85 to-transparent">
          <button
            onClick={onDone}
            className="flex-1 py-3 rounded-2xl text-xs font-bold tracking-widest stat-card text-muted-foreground active:scale-[0.98]"
          >SKIP</button>
          <button
            onClick={() => last ? onDone() : setStep(step + 1)}
            className="flex-[2] py-3 rounded-2xl text-xs font-bold tracking-widest bg-shred text-primary-foreground glow-shred flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {last ? "LET'S SHRED" : "NEXT"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Announcement Overlay -------------------- */

function AnnouncementOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] bg-background/90 backdrop-blur-md flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-[28px] border border-border bg-card p-5 shadow-2xl reveal-pop">
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-shred/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.3em] text-shred">
            <Sparkles className="w-3.5 h-3.5" /> New drop
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full stat-card flex items-center justify-center" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-2xl border border-shred/20 bg-gradient-to-br from-shred/10 via-background to-background p-4">
          <h2 className="font-display text-2xl leading-tight">Start strong. Claim your on-chain identity.</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            To get started, you need an on-chain username on Celo. For the first 1000 users, we are sponsoring the Celo gas needed to register your username on Celo.
          </p>

          <div className="mt-4 rounded-2xl border border-border bg-background/80 p-3 text-sm">
            <p className="font-semibold text-foreground">Message</p>
            <a
              href="https://farcaster.xyz/uniquebeing404"
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-shred/10 px-3 py-2 font-semibold text-shred transition hover:bg-shred/20"
            >
              <span>@uniquebeing404</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Tap the handle above to open the Farcaster profile of <span className="font-semibold text-foreground">@uniquebeing404</span> and receive gas sponsorship help.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full rounded-2xl bg-shred py-3 text-sm font-black uppercase tracking-[0.25em] text-primary-foreground glow-shred active:scale-[0.98]"
        >
          Let’s shred
        </button>
      </div>
    </div>
  );
}

/* -------------------- Username Registration Modal -------------------- */

const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;

function UsernameModal({
  walletAddress, onConnect, onClose, onRegistered, getEth,
}: {
  walletAddress: string | null;
  onConnect: () => Promise<string | null>;
  onClose: () => void;
  onRegistered: (name: string) => void;
  getEth: () => unknown;
}) {
  const [name, setName] = useState("");
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = USERNAME_RE.test(name);

  useEffect(() => {
    setAvailable(null);
    setError(null);
    if (!valid) return;
    const eth = getEth() as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } | null;
    if (!eth) return;
    let cancelled = false;
    setChecking(true);
    (async () => {
      try {
        const { createPublicClient, custom, encodeFunctionData, decodeFunctionResult } = await import("viem");
        const { celo } = await import("viem/chains");
        const client = createPublicClient({ chain: celo, transport: custom(eth) });
        const data = encodeFunctionData({ abi: USERNAME_ABI, functionName: "isAvailable", args: [name] });
        const res = await client.call({ to: USERNAME_CONTRACT as `0x${string}`, data });
        const decoded = decodeFunctionResult({ abi: USERNAME_ABI, functionName: "isAvailable", data: res.data ?? "0x" });
        if (!cancelled) setAvailable(Boolean(decoded));
      } catch {
        if (!cancelled) setAvailable(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [name, valid, getEth]);

  const register = async () => {
    setError(null);
    let addr = walletAddress;
    if (!addr) {
      addr = await onConnect();
      if (!addr) { setError("Connect a wallet to register."); return; }
    }
    if (!valid) { setError("Username must be 3–16 letters, numbers, or underscores."); return; }
    setSubmitting(true);
    try {
      const eth = getEth() as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> } | null;
      if (!eth) throw new Error("No wallet available.");
      const { createWalletClient, custom } = await import("viem");
      const { celo } = await import("viem/chains");
      const client = createWalletClient({ account: addr as `0x${string}`, chain: celo, transport: custom(eth) });
      await client.writeContract({
        address: USERNAME_CONTRACT as `0x${string}`,
        abi: USERNAME_ABI,
        functionName: "registerUser",
        args: [name],
      });
      onRegistered(name);
    } catch (e: unknown) {
      setError((e as Error)?.message?.slice(0, 120) || "Registration failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-background/90 backdrop-blur-md flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl bg-card border border-border p-6 reveal-pop">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-shred" />
            <h2 className="font-display text-xl">CLAIM YOUR NAME</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full stat-card flex items-center justify-center" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          Pick a username to track your discoveries, XP, and leaderboard rank. This is a one-time on-chain registration signed by your wallet.
        </p>
        <div className="relative">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.replace(/\s/g, ""))}
            maxLength={16}
            placeholder="shredder_01"
            className="w-full bg-secondary/60 border border-border rounded-xl px-4 py-3 text-sm font-bold tracking-wide outline-none focus:border-shred"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {checking && <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />}
            {!checking && valid && available === true && <Check className="w-4 h-4 text-shred" />}
            {!checking && valid && available === false && <X className="w-4 h-4 text-destructive" />}
          </div>
        </div>
        <div className="mt-2 text-[10px] tracking-wider text-muted-foreground">
          {!name && "3–16 chars · letters, numbers, underscores"}
          {name && !valid && <span className="text-destructive">Invalid format.</span>}
          {valid && available === true && <span className="text-shred">Available!</span>}
          {valid && available === false && <span className="text-destructive">Already taken.</span>}
        </div>
        {error && (
          <div className="mt-3 text-[11px] text-destructive flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {error}
          </div>
        )}
        <button
          onClick={register}
          disabled={submitting || !valid || available === false}
          className="mt-5 w-full py-3 rounded-2xl font-bold tracking-widest bg-shred text-primary-foreground glow-shred active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> SIGNING…</> : <>SIGN &amp; REGISTER</>}
        </button>
        <button
          onClick={onClose}
          className="mt-2 w-full py-2 rounded-xl text-[11px] font-bold tracking-widest text-muted-foreground"
        >
          NOT NOW
        </button>
      </div>
    </div>
  );
}

/* -------------------- Help & FAQ Sheet -------------------- */

const FAQ_ITEMS: { q: string; a: string }[] = [
  { q: "What is Shreds?", a: "Shreds is a mini app on Celo where you shred digital packs to discover USDM rewards, rare collection cards, XP and facts about MiniPay & Celo." },
  { q: "How do I shred a pack?", a: "Pick a pack, then swipe diagonally across it. Paid packs charge USDM through your wallet first, then reveal your discoveries." },
  { q: "How do rewards work?", a: "Every shred rolls a USDM reward from a weighted table sized to the pack tier. Rewards are sent from the Shreds rewarder wallet to your wallet automatically after the reveal." },
  { q: "Why do I need a username?", a: "Usernames are registered on-chain so your discoveries and leaderboard rank stay yours across sessions and devices." },
  { q: "How often can I open the free Starter Pack?", a: "The Starter Pack is free to shred and available any time to help you learn how discoveries work." },
  { q: "Which wallets are supported?", a: "MiniPay, Farcaster's built-in wallet, and any Celo-compatible browser wallet (e.g. MetaMask on Celo)." },
  { q: "Are rewards sent automatically?", a: "Yes. As soon as a shred generates a USDM discovery, the rewarder sends the amount to your wallet — you never have to claim manually." },
];

const SOCIAL_LINKS = [
  { label: "Official X", href: "https://x.com/shreds_x" },
  { label: "Telegram Channel", href: "https://t.me/shredsofficial" },
  { label: "Telegram Community", href: "https://t.me/+E2XQlL0xko82ZjZk" },
  { label: "Email Support", href: "mailto:shreds@signalify.xyz" },
];

function HelpSheet({ onClose, onReplay }: { onClose: () => void; onReplay: () => void }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Sheet title="Help & FAQ" onClose={onClose} Icon={HelpCircle}>
      <button
        onClick={onReplay}
        className="w-full py-3 rounded-2xl bg-shred text-primary-foreground font-bold text-xs tracking-widest glow-shred active:scale-[0.98] flex items-center justify-center gap-2 mb-4"
      >
        <ArrowRight className="w-4 h-4" /> REPLAY TUTORIAL
      </button>

      <div className="space-y-1.5 mb-5">
        {FAQ_ITEMS.map((it, i) => (
          <div key={i} className="stat-card rounded-xl overflow-hidden">
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left"
            >
              <span className="font-bold text-xs">{it.q}</span>
              <span className="text-shred text-lg leading-none shrink-0">{open === i ? "−" : "+"}</span>
            </button>
            {open === i && (
              <div className="px-3 pb-3 text-[11px] leading-relaxed text-muted-foreground">{it.a}</div>
            )}
          </div>
        ))}
      </div>

      <div className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground mb-2">CONNECT WITH US</div>
      <div className="grid grid-cols-2 gap-2">
        {SOCIAL_LINKS.map((s) => (
          <a
            key={s.href}
            href={s.href}
            target="_blank"
            rel="noreferrer"
            className="stat-card rounded-xl px-3 py-2.5 flex items-center gap-2 active:scale-[0.98] transition"
          >
            <ExternalLink className="w-3.5 h-3.5 text-shred shrink-0" />
            <span className="text-[11px] font-bold truncate">{s.label}</span>
          </a>
        ))}
      </div>
      <div className="mt-4 text-center text-[10px] text-muted-foreground">
        Built on Celo · Powered by MiniPay & Farcaster
      </div>
    </Sheet>
  );
}


