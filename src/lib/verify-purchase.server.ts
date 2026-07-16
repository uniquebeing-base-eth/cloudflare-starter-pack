// On-chain verification of a paid pack purchase.
//
// Prevents the "approve without pay" exploit: reads the Celo transaction
// receipt for the given txHash and confirms that a USDM Transfer event
// moved at least `priceUsdm` tokens from `wallet` into the ShredPayments
// contract in the same transaction. Called from recordPackPurchase before
// any purchase row (which later authorises a reward payout) is written.
import { PAYMENT_CONTRACT, USDM_ADDRESS } from "./contracts";
import { getRuntimeEnv, resolveCeloRpcUrl } from "./reward-distribution";

// keccak256("Transfer(address,address,uint256)")
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function topicToAddress(topic: string): string {
  return `0x${topic.slice(26).toLowerCase()}`;
}

export async function verifyPackPurchaseOnChain(params: {
  wallet: string;
  txHash: string;
  priceUsdm: number;
}): Promise<{ valid: true } | { valid: false; reason: string }> {
  const { createPublicClient, http, parseUnits } = await import("viem");
  const { celo } = await import("viem/chains");
  const rpcUrl = resolveCeloRpcUrl(getRuntimeEnv());
  const client = createPublicClient({ chain: celo, transport: http(rpcUrl) });

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: params.txHash as `0x${string}` });
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

  const minAmount = parseUnits(params.priceUsdm.toString(), 18);
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
  return { valid: false, reason: "no_matching_transfer" };
}
