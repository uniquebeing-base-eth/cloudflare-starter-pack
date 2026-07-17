// On-chain verification of a paid pack purchase.
//
// Prevents the "approve without pay" exploit: reads the Celo transaction
// receipt for the given txHash and confirms that buyWithToken() emitted the
// ShredPayments PackPurchased event for this wallet, pack, token, amount and
// orderId. Called from recordPackPurchase before any purchase row (which later
// authorises a reward payout) is written.
import { PACK_KEY, PAYMENT_ABI, PAYMENT_CONTRACT, USDM_ADDRESS } from "./contracts";
import { getRuntimeEnv, resolveCeloRpcUrl } from "./reward-distribution";

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// keccak256("PackPurchased(address,uint8,address,uint256,bytes32)")
// Emitted by ShredPayments after buyWithToken() accepts the pack payment.
const PACK_PURCHASED_TOPIC =
  "0x75d940ccb4571dd13a0e4af55290974e2812d18104a08e516e31b8a3773ddd8c";

const BUY_WITH_TOKEN_SELECTOR = "0x3a693b62";

function isTxHash(value?: string | null): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{64}$/.test(value ?? "");
}

function topicToAddress(topic: string): string {
  return `0x${topic.slice(26).toLowerCase()}`;
}

function topicToBigInt(topic: string): bigint {
  return BigInt(topic);
}

function parsePurchaseEventData(data: string): { amount: bigint; orderId: string } | null {
  const hex = data.replace(/^0x/, "");
  if (hex.length < 128) return null;
  return {
    amount: BigInt(`0x${hex.slice(0, 64)}`),
    orderId: `0x${hex.slice(64, 128)}`.toLowerCase(),
  };
}

function receiptHasValidPurchaseEvent(params: {
  logs: Array<{ address?: string; topics?: readonly unknown[]; data?: string }>;
  wallet: string;
  packId: string;
  orderId: string;
  minAmount: bigint;
}): boolean {
  const expectedPackKey = BigInt(PACK_KEY[params.packId] ?? -1);
  const wallet = params.wallet.toLowerCase();
  const usdmAddr = USDM_ADDRESS.toLowerCase();
  const orderId = params.orderId.toLowerCase();

  for (const log of params.logs) {
    if ((log.address ?? "").toLowerCase() !== PAYMENT_CONTRACT.toLowerCase()) continue;
    const topics = (log.topics ?? []) as string[];
    if (topics[0] !== PACK_PURCHASED_TOPIC || topics.length < 4) continue;
    if (topicToAddress(topics[1]) !== wallet) continue;
    if (topicToBigInt(topics[2]) !== expectedPackKey) continue;
    if (topicToAddress(topics[3]) !== usdmAddr) continue;

    const parsed = parsePurchaseEventData(log.data ?? "0x");
    if (!parsed) continue;
    if (parsed.orderId !== orderId) continue;
    if (parsed.amount < params.minAmount) continue;
    return true;
  }
  return false;
}

export async function verifyPackPurchaseOnChain(params: {
  wallet: string;
  txHash: string;
  packId: string;
  orderId: string;
  priceUsdm: number;
}): Promise<{ valid: true } | { valid: false; reason: string }> {
  const { createPublicClient, decodeFunctionData, http, parseUnits } = await import("viem");
  const { celo } = await import("viem/chains");
  const rpcUrl = resolveCeloRpcUrl(getRuntimeEnv());
  const client = createPublicClient({ chain: celo, transport: http(rpcUrl) });

  if (!isTxHash(params.txHash)) return { valid: false, reason: "invalid_tx_hash" };

  let receipt;
  let tx;
  try {
    [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: params.txHash }),
      client.getTransaction({ hash: params.txHash }),
    ]);
  } catch (e) {
    return { valid: false, reason: `receipt_not_found:${(e as Error)?.message?.slice(0, 80) ?? ""}` };
  }
  if (!receipt) return { valid: false, reason: "receipt_missing" };
  if (receipt.status !== "success") return { valid: false, reason: "tx_reverted" };
  if ((receipt.to ?? "").toLowerCase() !== PAYMENT_CONTRACT.toLowerCase()) {
    return { valid: false, reason: "wrong_to_contract" };
  }
  if ((receipt.from ?? "").toLowerCase() !== params.wallet.toLowerCase()) {
    return { valid: false, reason: "wrong_from_wallet" };
  }

  // The payment contract is the source of truth. MiniPay/Celo token receipts
  // can show the stablecoin Transfer in a way that is not always `to` the
  // payment contract, so verify the contract-level purchase event and calldata
  // instead of relying only on ERC-20 Transfer semantics.
  if (!tx?.input?.startsWith(BUY_WITH_TOKEN_SELECTOR)) {
    return { valid: false, reason: "wrong_function" };
  }

  try {
    const decoded = decodeFunctionData({ abi: PAYMENT_ABI, data: tx.input });
    if (decoded.functionName !== "buyWithToken") return { valid: false, reason: "wrong_function" };
    const [packKey, token, orderId] = decoded.args as readonly [number, string, string];
    if (BigInt(packKey) !== BigInt(PACK_KEY[params.packId] ?? -1)) return { valid: false, reason: "wrong_pack" };
    if (String(token).toLowerCase() !== USDM_ADDRESS.toLowerCase()) return { valid: false, reason: "wrong_token" };
    if (String(orderId).toLowerCase() !== params.orderId.toLowerCase()) return { valid: false, reason: "wrong_order" };
  } catch {
    return { valid: false, reason: "decode_failed" };
  }

  const minAmount = parseUnits(params.priceUsdm.toString(), 18);
  if (receiptHasValidPurchaseEvent({
    logs: receipt.logs,
    wallet: params.wallet,
    packId: params.packId,
    orderId: params.orderId,
    minAmount,
  })) {
    return { valid: true };
  }

  // Backward-compatible fallback for any older payment-contract version that
  // did not emit PackPurchased but did transfer USDM into the payment contract.
  const wallet = params.wallet.toLowerCase();
  const paymentAddr = PAYMENT_CONTRACT.toLowerCase();
  const usdmAddr = USDM_ADDRESS.toLowerCase();

  for (const log of receipt.logs) {
    if ((log.address ?? "").toLowerCase() !== usdmAddr) continue;
    const topics = log.topics ?? [];
    if (topics[0] !== TRANSFER_TOPIC || topics.length < 3) continue;
    const from = topicToAddress(topics[1] as string);
    const to = topicToAddress(topics[2] as string);
    if (from !== wallet || to !== paymentAddr) continue;
    const amount = BigInt(log.data);
    if (amount >= minAmount) return { valid: true };
  }
  return { valid: false, reason: "no_purchase_event" };
}

export async function findVerifiedPackPurchaseOnChain(params: {
  wallet: string;
  packId: string;
  orderId: string;
  priceUsdm: number;
  timeoutMs?: number;
}): Promise<{ valid: true; txHash: string } | { valid: false; reason: string }> {
  const { createPublicClient, http, parseAbiItem, parseUnits } = await import("viem");
  const { celo } = await import("viem/chains");
  const rpcUrl = resolveCeloRpcUrl(getRuntimeEnv());
  const client = createPublicClient({ chain: celo, transport: http(rpcUrl) });
  const minAmount = parseUnits(params.priceUsdm.toString(), 18);
  const expectedPackKey = BigInt(PACK_KEY[params.packId] ?? -1);
  const startedAt = Date.now();
  const timeoutMs = params.timeoutMs ?? 45_000;
  let lastReason = "purchase_event_not_found";
  const purchaseEvent = parseAbiItem(
    "event PackPurchased(address indexed buyer, uint8 indexed packKey, address indexed token, uint256 amount, bytes32 orderId)",
  );

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const latest = await client.getBlockNumber();
      const fromBlock = latest > 900n ? latest - 900n : 0n;
      const logs = await client.getLogs({
        address: PAYMENT_CONTRACT as `0x${string}`,
        event: purchaseEvent,
        args: {
          buyer: params.wallet as `0x${string}`,
          packKey: Number(expectedPackKey),
          token: USDM_ADDRESS as `0x${string}`,
        },
        fromBlock,
        toBlock: latest,
      });

      for (const log of logs) {
        const args = log.args as { amount?: bigint; orderId?: string };
        const amount = args.amount ?? 0n;
        const orderId = String(args.orderId ?? "").toLowerCase();
        if (orderId !== params.orderId.toLowerCase()) continue;
        if (amount < minAmount) {
          lastReason = "underpaid";
          continue;
        }
        const txHash = log.transactionHash;
        const verified = await verifyPackPurchaseOnChain({
          wallet: params.wallet,
          txHash,
          packId: params.packId,
          orderId: params.orderId,
          priceUsdm: params.priceUsdm,
        });
        if (verified.valid) return { valid: true, txHash };
        lastReason = verified.reason;
      }
    } catch (e) {
      lastReason = (e as Error)?.message?.slice(0, 120) || "purchase_lookup_failed";
    }

    await new Promise((resolve) => setTimeout(resolve, 2_500));
  }

  return { valid: false, reason: lastReason };
}
