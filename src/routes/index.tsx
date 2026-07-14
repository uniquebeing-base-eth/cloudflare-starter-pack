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
  rarity?: "Common" | "Rare" | "Epic" | "Legendary";
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
        image: CARD_LIBRARY["neon-cube"],
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

const XPS: Discovery[] = [
  { kind: "XP", title: "50 XP", sub: "Experience Points", color: "oklch(0.7 0.2 250)", Icon: Star, rarity: "Common", image: DISCOVERY_IMG.xp, amountRaw: 50 },
  { kind: "XP", title: "150 XP", sub: "Experience Points", color: "oklch(0.7 0.2 250)", Icon: Star, rarity: "Rare", image: DISCOVERY_IMG.xp, amountRaw: 150 },
  { kind: "XP", title: "500 XP", sub: "Experience Points", color: "oklch(0.7 0.2 250)", Icon: Star, rarity: "Epic", image: DISCOVERY_IMG.xp, amountRaw: 500 },
];
const CARDS: Discovery[] = [
  { kind: "CARD", title: "Neon Cube", sub: "Chance. Mystery. Reward.", color: "oklch(0.75 0.18 180)", Icon: Award, rarity: "Rare", image: CARD_LIBRARY["neon-cube"] },
  { kind: "CARD", title: "Celo Compass", sub: "Navigate the Celo ecosystem.", color: "oklch(0.75 0.2 145)", Icon: Award, rarity: "Rare", image: CARD_LIBRARY["celo-compass"] },
  { kind: "CARD", title: "MiniPay Sigil", sub: "Trust. Connect. Transfer.", color: "oklch(0.7 0.22 300)", Icon: Award, rarity: "Rare", image: CARD_LIBRARY["minipay-sigil"] },
  { kind: "CARD", title: "Celo Orbis", sub: "The heart of decentralized trust.", color: "oklch(0.7 0.22 300)", Icon: Award, rarity: "Epic", image: CARD_LIBRARY["celo-orbis"] },
  { kind: "CARD", title: "Celo Relic Ring", sub: "Powered by legacy.", color: "oklch(0.85 0.22 130)", Icon: Award, rarity: "Epic", image: CARD_LIBRARY["celo-relic-ring"] },
  { kind: "CARD", title: "Trust Lens", sub: "See beyond. Trust deeper.", color: "oklch(0.7 0.22 300)", Icon: Award, rarity: "Epic", image: CARD_LIBRARY["trust-lens"] },
  { kind: "CARD", title: "Celo Sentinel", sub: "Protect. Verify. Empower.", color: "oklch(0.82 0.22 135)", Icon: Award, rarity: "Epic", image: CARD_LIBRARY["celo-sentinel"] },
  { kind: "CARD", title: "MiniPay Transceiver", sub: "Send value. Anywhere. Instantly.", color: "oklch(0.7 0.22 300)", Icon: Award, rarity: "Epic", image: CARD_LIBRARY["minipay-transceiver"] },
  { kind: "CARD", title: "Celo Genesis Core", sub: "Trust isn't given. It's protocol.", color: "oklch(0.82 0.17 85)", Icon: Award, rarity: "Legendary", image: CARD_LIBRARY["celo-genesis-core"] },
  { kind: "CARD", title: "Celo Genesis Shard", sub: "Origins power everything.", color: "oklch(0.82 0.17 85)", Icon: Award, rarity: "Legendary", image: CARD_LIBRARY["celo-genesis-shard"] },
  { kind: "CARD", title: "MiniPay Prism", sub: "Value flows. Trust remains.", color: "oklch(0.85 0.22 130)", Icon: Award, rarity: "Legendary", image: CARD_LIBRARY["minipay-prism"] },
];

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
  if (Math.random() > 0.4) items.push({ ...pickRandom(XPS) });
  if (Math.random() > 0.55) items.push({ ...pickRandom(CARDS) });
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
async function buyPackOnChain(packId: string, walletAddress: string, getEth: () => unknown) {
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
  const approveTx = await client.writeContract({
    address: USDM_ADDRESS as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "approve",
    args: [PAYMENT_CONTRACT as `0x${string}`, price],
  });
  await publicClient.waitForTransactionReceipt({ hash: approveTx });
  // Buy pack and wait for confirmation before returning
  const tx = await client.writeContract({
    address: PAYMENT_CONTRACT as `0x${string}`,
    abi: PAYMENT_ABI,
    functionName: "buyWithToken",
    args: [PACK_KEY[packId]!, USDM_ADDRESS as `0x${string}`, orderId],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: tx });
  if (receipt.status !== "success") throw new Error("Payment transaction reverted");
  return { txHash: tx, orderId };
}

/* -------------------- Username helper -------------------- */
async function fetchUsernameOnChain(walletAddress: string): Promise<string | null> {
  try {
    const { createPublicClient, http } = await import("viem");
    const { celo } = await import("viem/chains");
    const publicClient = createPublicClient({ chain: celo, transport: http() });
    const name = (await publicClient.readContract({
      address: USERNAME_CONTRACT as `0x${string}`,
      abi: USERNAME_ABI,
      functionName: "usernameOf",
      args: [walletAddress as `0x${string}`],
    })) as string;
    return name && name.length > 0 ? name : null;
  } catch { return null; }
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
  const [purchased, setPurchased] = useState<Set<string>>(new Set(["starter"]));
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null);
  const [leaderboardRange, setLeaderboardRange] = useState<"daily" | "weekly" | "monthly" | "all">("weekly");
  const [starterCooldown, setStarterCooldown] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [starterCooldownUntil, setStarterCooldownUntil] = useState<number | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [showUsernameModal, setShowUsernameModal] = useState(false);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>(LIVE_EVENTS_SEED);
  const [packStats, setPackStats] = useState<Record<string, { owners: number; shreds: number; drops: number }>>({});
  const [globalStats, setGlobalStats] = useState<{ shredders: number; packs_shredded: number; discoveries: number; rewards_usdm: number }>({ shredders: 0, packs_shredded: 0, discoveries: 0, rewards_usdm: 0 });
  const [avatarByWallet, setAvatarByWallet] = useState<Record<string, string>>({});
  const wallet = useWallet();
  const callDistribute = useServerFn(distributeReward);
  
  const callUpsertProfile = useServerFn(upsertProfile);
  const callGetMyProfile = useServerFn(getMyProfile);
  const callRecordShred = useServerFn(recordShred);
  const callListMyDiscoveries = useServerFn(listMyDiscoveries);
  const callGetStarterCooldown = useServerFn(getStarterCooldown);
  const callRecordPackPurchase = useServerFn(recordPackPurchase);
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
        const nextProfile = profile as { username?: string | null; wallet?: string | null; xp?: number | null; packs_shredded?: number | null } | null;
        if (nextProfile?.username) {
          setUsername(nextProfile.username);
        } else {
          setUsername(null);
        }
        if (nextProfile) {
          const normalizedProfile = toStoredProfile(wallet.address, nextProfile);
          setProfileSummary(normalizedProfile);
        } else {
          setProfileSummary(null);
        }
        setCollection(((discoveryRows as Array<{ kind: string; title: string; sub: string; rarity?: string | null; amount?: number | null }> | undefined) ?? []).map(toUiDiscovery));
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
  }, [wallet.address, leaderboardRange, callGetMyProfile, callListMyDiscoveries, callGetStarterCooldown, callGetLeaderboard]);

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
    void fetchUsernameOnChain(wallet.address).then((name) => {
      if (cancelled || !name) return;
      setUsername(name);
      if (wallet.address) {
        void callUpsertProfile({ data: { wallet: wallet.address, username: name } }).catch(() => { /* non-fatal */ });
      }
    });
    if (wallet.address) {
      void callUpsertProfile({ data: { wallet: wallet.address } }).catch(() => { /* non-fatal */ });
    }
    void refreshProfileAndLeaderboard();
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
          if (usdmItem && usdmAmount > 0) {
            const nonce = `${wallet.address.toLowerCase()}-${pack.id}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            console.info("[reward] ✓ Sending payout", { packId: pack.id, amountUsdm: usdmAmount });
            const result = await callDistribute({
              data: {
                wallet: wallet.address,
                packId: pack.id as "starter" | "mystery" | "alpha" | "legendary" | "explorer",
                amountUsdm: usdmAmount,
                nonce,
              },
            });
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
    // If paid and not yet purchased, buy first
    if (pack.priceNum > 0 && !purchased.has(pack.id)) {
      if (wallet.chainId !== CELO_CHAIN_ID) {
        setBuyError("Switching to Celo network…");
        const acct = await wallet.connect();
        if (!acct || wallet.chainId !== CELO_CHAIN_ID) {
          setBuyError("Please switch your wallet to the Celo network to continue.");
          return;
        }
        setBuyError(null);
      }
      setBuying(true); setBuyError(null);
      try {
        const purchase = await buyPackOnChain(pack.id, wallet.address!, wallet.getEth);
        await callRecordPackPurchase({ data: { wallet: wallet.address!, packId: pack.id as "starter" | "mystery" | "alpha" | "legendary" | "explorer", orderId: purchase.orderId, txHash: purchase.txHash, priceUsdm: pack.priceNum } });
        // Do not persist a "purchased" entry — paid packs are single-use.
        // The user must pay for each shred; prevent permanent unlocking.
        setBuying(false);
        executeShred();
      } catch (e: unknown) {
        setBuying(false);
        setBuyError((e as Error)?.message?.slice(0, 80) || "Purchase failed.");
      }
      return;
    }
    executeShred();
  }, [pack, purchased, wallet, starterCooldown, executeShred, callRecordPackPurchase]);

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
                <div className="w-full h-full flex items-center justify-center" style={{ background: AVATAR_GRADIENTS[0] }}>
                  <User className="w-4 h-4 text-white" />
                </div>
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
          needsPurchase={pack.priceNum > 0 && !purchased.has(pack.id)}
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
        />
      )}
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
  index, onPrev, onNext, onShred, phase, buying, needsPurchase,
}: {
  index: number; onPrev: () => void; onNext: () => void; onShred: () => void;
  phase: "idle" | "slashing" | "shredded" | "revealing"; buying: boolean; needsPurchase: boolean;
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
              <div className="font-display text-xl text-white animate-pulse">Purchasing…</div>
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
  Rare: "oklch(0.7 0.2 250)",
  Epic: "oklch(0.7 0.22 300)",
  Legendary: "oklch(0.82 0.17 85)",
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
          className="w-4 h-4 rounded-full shrink-0"
          style={{ background: AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length] }}
        />
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
            <div key={`${row.wallet ?? row.username ?? index}`} className="stat-card rounded-xl px-3 py-2 flex items-center gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] bg-shred/15 text-shred">#{index + 1}</div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{row.username ?? shortAddr(row.wallet)}</div>
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

function ProfileSheet({ onClose, wallet, collection, username, summary, onRegister }: {
  onClose: () => void; wallet: string | null; collection: Discovery[];
  username: string | null; summary: ProfileSummary | null; onRegister: () => void;
}) {
  const cards = collection.filter(c => c.kind === "CARD");
  const facts = collection.filter(c => c.kind === "FACT");
  const stables = collection.filter(c => c.kind === "USDM");
  const [tab, setTab] = useState<"CARDS" | "FACTS" | "REWARDS">("CARDS");

  return (
    <Sheet title="Profile" onClose={onClose} Icon={User}>
      <div className="stat-card rounded-2xl p-4 flex items-center gap-3">
        <div className="w-14 h-14 rounded-2xl shrink-0" style={{ background: AVATAR_GRADIENTS[0] }} />
        <div className="flex-1 min-w-0">
          <div className="font-display text-xl truncate">{username ? username.toUpperCase() : "UNCLAIMED"}</div>
          <div className="text-[11px] text-muted-foreground truncate">{wallet ? shortAddr(wallet) : "Wallet not connected"}</div>
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
                <div className="flex-1 font-bold">{s.title}</div>
                <div className="text-[10px] text-muted-foreground tracking-widest">{s.sub}</div>
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


