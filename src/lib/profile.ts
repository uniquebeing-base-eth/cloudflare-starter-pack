export type StoredProfile = {
  username: string | null;
  wallet: string | null;
  xp: number;
  packs_shredded: number;
  level: number;
  avatar_url?: string | null;
};

export function normalizeWallet(wallet: string | null | undefined): string | null {
  if (!wallet) return null;
  const normalized = wallet.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function walletToProfileId(wallet: string): string {
  const normalized = wallet.toLowerCase().trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  const tail = `${hex}${hex}${hex}${hex}`.slice(0, 32);
  return `${tail.slice(0, 8)}-${tail.slice(8, 12)}-4${tail.slice(13, 16)}-8${tail.slice(17, 20)}-${tail.slice(20, 32)}`;
}

export function toStoredProfile(wallet: string | null | undefined, profile: { username?: string | null; wallet?: string | null; xp?: number | null; packs_shredded?: number | null; level?: number | null; avatar_url?: string | null } | null | undefined): StoredProfile {
  const normalizedWallet = normalizeWallet(wallet ?? profile?.wallet);
  const xp = Number(profile?.xp ?? 0);
  const packsShredded = Number(profile?.packs_shredded ?? 0);
  const level = Number(profile?.level ?? Math.max(1, Math.floor(xp / 500) + 1));

  return {
    username: profile?.username ?? null,
    wallet: normalizedWallet,
    xp,
    packs_shredded: packsShredded,
    level,
    avatar_url: profile?.avatar_url ?? null,
  };
}

export function mergeStoredProfiles(
  existing: Record<string, StoredProfile> | undefined,
  incoming: Array<Partial<StoredProfile> | null | undefined>,
): Record<string, StoredProfile> {
  const next = { ...(existing ?? {}) };

  incoming.forEach((entry) => {
    const normalizedWallet = normalizeWallet(entry?.wallet);
    if (!normalizedWallet) return;

    const existingEntry = next[normalizedWallet];
    const merged = existingEntry
      ? {
          username: entry?.username ?? existingEntry.username ?? null,
          wallet: normalizedWallet,
          xp: Math.max(Number(existingEntry.xp ?? 0), Number(entry?.xp ?? 0)),
          packs_shredded: Math.max(Number(existingEntry.packs_shredded ?? 0), Number(entry?.packs_shredded ?? 0)),
          level: Math.max(
            Number(existingEntry.level ?? 1),
            Number(entry?.level ?? 1),
            Math.max(1, Math.floor(Math.max(Number(existingEntry.xp ?? 0), Number(entry?.xp ?? 0)) / 500) + 1),
          ),
        }
      : toStoredProfile(normalizedWallet, entry);

    next[normalizedWallet] = merged;
  });

  return next;
}

export type LeaderboardRow = {
  username: string | null;
  wallet: string | null;
  xp: number;
  packs_shredded: number;
  range: string;
};

export function buildLeaderboardFromProfiles(profiles: Record<string, StoredProfile>): LeaderboardRow[] {
  return Object.values(profiles)
    .filter((profile) => (profile.xp ?? 0) > 0 || (profile.packs_shredded ?? 0) > 0)
    .sort((a, b) => (b.xp ?? 0) - (a.xp ?? 0) || (b.packs_shredded ?? 0) - (a.packs_shredded ?? 0))
    .slice(0, 50)
    .map((profile) => ({
      username: profile.username,
      wallet: profile.wallet,
      xp: profile.xp,
      packs_shredded: profile.packs_shredded,
      range: "all",
    }));
}
