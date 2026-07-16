// Server fn: sends USDM from the rewarder wallet to the player after a shred.
// Uses BACKEND_SIGNER_KEY on Celo mainnet. The signer must be allow-listed on
// the RewardDistributor contract (rewarders[signer] == true).
//
// Auth model (wallet-only app — NO Lovable Cloud session required):
//   - Caller supplies { wallet, packId, amountUsdm, nonce }.
//   - Server clamps amountUsdm to a per-pack ceiling as defence-in-depth.
//   - claimId = keccak256(wallet, packId, nonce) — the on-chain `claimed[]`
//     mapping is the source of truth for replay protection, so a client
//     replaying the same nonce is rejected by the contract itself.
//   - The backend signer must be allow-listed via setRewarder() on-chain;
//     that is the real authorization boundary, not a user session.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  PACK_KEY,
  PACK_PRICE_USDM,
  REWARDS_ABI,
  REWARDS_CONTRACT,
  USDM_ADDRESS,
  ERC20_ABI,
} from "./contracts";
import {
  getRuntimeEnv,
  normalizePrivateKey,
  resolveCeloRpcUrl,
} from "./reward-distribution";

const Input = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  packId: z.enum(["starter", "mystery", "alpha", "legendary", "explorer"]),
  amountUsdm: z.number().min(0).max(20),
  nonce: z.string().min(4).max(128),
  // Required for every paid pack: the on-chain orderId whose payment was
  // already verified by recordPackPurchase. One purchase authorises exactly
  // one reward payout (atomic claim in `claim_pack_purchase_for_reward`).
  orderId: z.string().min(1).max(128).optional(),
});


export const distributeReward = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => Input.parse(raw))
  .handler(async ({ data }) => {
    console.info("[reward] ✓ Loading backend signer", {
      wallet: data.wallet,
      packId: data.packId,
      amountUsdm: data.amountUsdm,
    });
    const runtimeEnv = getRuntimeEnv();
    const pk = normalizePrivateKey(
      runtimeEnv.BACKEND_SIGNER_KEY || runtimeEnv.VITE_BACKEND_SIGNER_KEY,
    );
    if (!pk) {
      console.error("[reward] missing BACKEND_SIGNER_KEY", {
        runtimeEnvKeys: Object.keys(runtimeEnv).sort(),
      });
      return { ok: false, error: "Reward signer not configured" };
    }

    // Clamp to a hard per-pack ceiling so a tampered client cannot request
    // more than 4x the pack price (or 0.05 USDM for the free starter).
    const priceCap = Number(PACK_PRICE_USDM[data.packId] || 0) * 4 || 0.05;
    const amount = Math.min(Math.max(data.amountUsdm, 0), priceCap);
    if (amount <= 0) {
      console.info("[reward] skipped zero reward", { packId: data.packId });
      return { ok: true, skipped: true, amount: 0 };
    }

    // CRITICAL: paid packs require an on-chain-verified purchase whose
    // reward slot has not been consumed yet. Starter is the only free pack.
    // The atomic RPC flips reward_paid false→true in a single UPDATE and
    // returns true only on the first successful claim, so a client cannot
    // replay the same orderId to pull multiple payouts. Combined with the
    // on-chain verification inside recordPackPurchase (approve()-only txs
    // are rejected because no USDM Transfer to the payment contract is
    // present in the receipt), this is the sole authorisation for a paid
    // reward — no reward is issued without a matching, unclaimed purchase.
    if (data.packId !== "starter") {
      if (!data.orderId) {
        console.error("[reward] paid pack missing orderId", { wallet: data.wallet, packId: data.packId });
        return { ok: false, error: "missing_order_id" };
      }
      const { getSupabasePublic } = await import("./supabase-public.server");
      const supabasePublic = getSupabasePublic();
      const { data: claimed, error: claimErr } = await supabasePublic.rpc(
        "claim_pack_purchase_for_reward",
        { _wallet: data.wallet.toLowerCase(), _pack_id: data.packId, _order_id: data.orderId },
      );
      if (claimErr) {
        console.error("[reward] claim rpc failed", { error: claimErr.message });
        return { ok: false, error: "claim_rpc_failed" };
      }
      if (!claimed) {
        console.warn("[reward] purchase not found or already claimed", {
          wallet: data.wallet, packId: data.packId, orderId: data.orderId,
        });
        return { ok: false, error: "purchase_not_found_or_already_claimed" };
      }
      console.info("[reward] ✓ Purchase claimed for reward", { orderId: data.orderId });
    }


    const [viem, { privateKeyToAccount }, { celo }] = await Promise.all([
      import("viem"),
      import("viem/accounts"),
      import("viem/chains"),
    ]);
    const {
      createWalletClient,
      createPublicClient,
      http,
      parseUnits,
      keccak256,
      encodePacked,
    } = viem;

    const rpcUrl = resolveCeloRpcUrl(runtimeEnv);
    const account = privateKeyToAccount(pk as `0x${string}`);
    const publicClient = createPublicClient({ chain: celo, transport: http(rpcUrl) });
    const walletClient = createWalletClient({ account, chain: celo, transport: http(rpcUrl) });

    const amountWei = parseUnits(amount.toString(), 18);
    const packKey = BigInt(PACK_KEY[data.packId] ?? 0);

    // Deterministic claimId bound to wallet + pack + nonce. Replaying the
    // same nonce hits the contract's claimed[] guard and reverts.
    const claimId = keccak256(
      encodePacked(
        ["address", "string", "string"],
        [data.wallet as `0x${string}`, data.packId, data.nonce],
      ),
    );

    const normalizedWallet = data.wallet.toLowerCase();
    console.info("[reward] ✓ Payout will be sent without service-role database writes", {
      claimId,
      wallet: normalizedWallet,
      amount,
    });

    console.info("[reward] distribute start", {
      wallet: data.wallet,
      packId: data.packId,
      amount,
      signer: account.address,
      rpcUrl,
      claimId,
    });

    try {
      const chainId = await publicClient.getChainId();
      console.info("[reward] ✓ Contract configuration", {
        chainId,
        expectedChainId: celo.id,
        rewardsContract: REWARDS_CONTRACT,
        usdmAddress: USDM_ADDRESS,
      });
      if (chainId !== celo.id) {
        return { ok: false, error: `Wrong chain id ${chainId}; expected Celo mainnet`, step: "chain_check", claimId };
      }

      const signerCelo = await publicClient.getBalance({ address: account.address });
      console.info("[reward] ✓ Signer gas balance checked", {
        signer: account.address,
        celoWei: signerCelo.toString(),
      });
      if (signerCelo <= 0n) {
        return { ok: false, error: "Backend signer has no CELO for gas", step: "signer_gas_check", claimId, signer: account.address };
      }

      const isRewarder = await publicClient.readContract({
        address: REWARDS_CONTRACT as `0x${string}`,
        abi: REWARDS_ABI,
        functionName: "rewarders",
        args: [account.address],
      });
      if (!isRewarder) {
        console.error("[reward] signer not authorised as rewarder", {
          signer: account.address,
        });
        return { ok: false, error: "signer_not_rewarder", signer: account.address };
      }
      console.info("[reward] ✓ Backend signer authorised", { signer: account.address });

      const alreadyClaimed = await publicClient.readContract({
        address: REWARDS_CONTRACT as `0x${string}`,
        abi: REWARDS_ABI,
        functionName: "claimed",
        args: [claimId],
      });
      if (alreadyClaimed) {
        console.info("[reward] claim already used", { claimId });
        return { ok: true, skipped: true, reason: "already_claimed", amount };
      }

      const treasuryBal = (await publicClient.readContract({
        address: USDM_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [REWARDS_CONTRACT as `0x${string}`],
      })) as bigint;
      if (treasuryBal < amountWei) {
        console.error("[reward] treasury underfunded", {
          have: treasuryBal.toString(),
          need: amountWei.toString(),
        });
        return { ok: false, error: "treasury_underfunded" };
      }
      console.info("[reward] ✓ Reward contract USDM balance checked", {
        have: treasuryBal.toString(),
        need: amountWei.toString(),
      });

      console.info("[reward] ✓ Sending payout", { claimId, amount, wallet: data.wallet });

      const { request } = await publicClient.simulateContract({
        account,
        address: REWARDS_CONTRACT as `0x${string}`,
        abi: REWARDS_ABI,
        functionName: "distribute",
        args: [
          claimId,
          data.wallet as `0x${string}`,
          packKey,
          0n, // celoAmount — USDM only
          [USDM_ADDRESS as `0x${string}`],
          [amountWei],
        ],
      });

      const hash = await walletClient.writeContract(request);
      console.info(`[reward] ✓ Transaction hash: ${hash}`, { hash, signer: account.address });

      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        timeout: 120_000,
      });
      const ok = receipt.status === "success";
      console.info("[reward] ✓ Transaction confirmed", {
        hash,
        status: receipt.status,
        block: receipt.blockNumber,
      });
      if (!ok) {
        console.error("[reward] ✗ Transaction reverted", { receipt });
      }

      if (ok) {
        console.info("[reward] ✓ Success", { hash, amount, claimId });
        // Attach payout tx hash to the most recent matching USDM discovery so
        // the Rewards tab can show a Celoscan link. Best-effort — do not fail
        // the payout if the write fails.
        try {
          const { getSupabasePublic } = await import("./supabase-public.server");
          await getSupabasePublic().rpc("set_reward_tx_hash", {
            _wallet: normalizedWallet,
            _amount: amount,
            _tx_hash: hash,
          });
        } catch (e) {
          console.warn("[reward] failed to attach tx hash to discovery", { error: (e as Error)?.message });
        }
      }

      return {
        ok,
        txHash: hash,
        amount,
        signer: account.address,
        claimId,
      };
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      console.error("[reward] ✗ Distribute error", {
        wallet: data.wallet,
        packId: data.packId,
        amount,
        signer: account?.address,
        error: msg,
        stack: (e as Error)?.stack,
      });
      return { ok: false, error: msg.slice(0, 300) || "send_failed" };
    }
  });
