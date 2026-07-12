import { useCallback, useEffect, useState } from "react";
import { CELO_CHAIN_HEX, CELO_CHAIN_ID } from "./contracts";

type Eth = {
  isMiniPay?: boolean;
  isMetaMask?: boolean;
  isFarcaster?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...a: unknown[]) => void) => void;
  removeListener?: (event: string, cb: (...a: unknown[]) => void) => void;
};

// Cached Farcaster provider (loaded lazily to avoid SSR issues).
const FARCASTER_SDK_URL = "https://esm.sh/@farcaster/miniapp-sdk@0.3.0";
let fcProvider: Eth | null = null;
async function loadFarcasterProvider(): Promise<Eth | null> {
  if (typeof window === "undefined") return null;
  if (fcProvider) return fcProvider;
  try {
    const mod = await import(/* @vite-ignore */ FARCASTER_SDK_URL);
    const sdk = (mod as { sdk?: unknown; default?: unknown }).sdk ??
      (mod as { default?: unknown }).default;
    const provider = (await (sdk as { wallet?: { getEthereumProvider?: () => Promise<unknown> } }).wallet?.getEthereumProvider?.()) as Eth | null;
    if (provider) { (provider as Eth).isFarcaster = true; fcProvider = provider; }
    return fcProvider;
  } catch { return null; }
}

function getEth(): Eth | null {
  if (typeof window === "undefined") return null;
  const injected = (window as unknown as { ethereum?: Eth }).ethereum ?? null;
  if (injected) return injected;
  return fcProvider;
}

async function ensureCelo(eth: Eth) {
  try {
    const chainId = (await eth.request({ method: "eth_chainId" })) as string;
    if (chainId?.toLowerCase() === CELO_CHAIN_HEX) return;
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CELO_CHAIN_HEX }],
    });
  } catch (err: unknown) {
    const code = (err as { code?: number })?.code;
    if (code === 4902) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: CELO_CHAIN_HEX,
          chainName: "Celo",
          nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
          rpcUrls: ["https://forno.celo.org"],
          blockExplorerUrls: ["https://celoscan.io"],
        }],
      });
    }
  }
}

export type WalletStatus = "idle" | "connecting" | "connected" | "unavailable";

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [status, setStatus] = useState<WalletStatus>("idle");
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [isFarcaster, setIsFarcaster] = useState(false);
  const [chainId, setChainId] = useState<number | null>(null);

  const connect = useCallback(async (opts?: { silent?: boolean }) => {
    let eth = getEth();
    // Fallback: no injected provider — try Farcaster mini-app SDK.
    if (!eth) eth = await loadFarcasterProvider();
    if (!eth) { setStatus("unavailable"); return null; }
    setStatus("connecting");
    try {
      setIsMiniPay(!!eth.isMiniPay);
      setIsFarcaster(!!eth.isFarcaster);
      const method = eth.isMiniPay || opts?.silent ? "eth_accounts" : "eth_requestAccounts";
      const accounts = (await eth.request({ method })) as string[];
      const acct = accounts?.[0] ?? null;
      if (!acct) { setStatus("unavailable"); return null; }
      setAddress(acct);
      await ensureCelo(eth);
      const cid = (await eth.request({ method: "eth_chainId" })) as string;
      setChainId(parseInt(cid, 16));
      setStatus("connected");
      return acct;
    } catch {
      setStatus("unavailable");
      return null;
    }
  }, []);

  // Silent auto-connect on mount (works instantly inside MiniPay).
  useEffect(() => { void connect({ silent: true }); }, [connect]);

  // Listen to account/chain changes.
  useEffect(() => {
    const eth = getEth();
    if (!eth?.on) return;
    const onAccounts = (accts: unknown) => {
      const a = (accts as string[])?.[0] ?? null;
      setAddress(a);
      setStatus(a ? "connected" : "unavailable");
    };
    const onChain = (cid: unknown) => setChainId(parseInt(String(cid), 16));
    eth.on("accountsChanged", onAccounts);
    eth.on("chainChanged", onChain);
    return () => {
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  return {
    address,
    status,
    isMiniPay,
    isFarcaster,
    chainId,
    isCorrectChain: chainId === CELO_CHAIN_ID,
    connect,
    getEth,
  };
}

export function shortAddr(a: string | null | undefined) {
  return a ? a.slice(0, 6) + "…" + a.slice(-4) : "";
}
