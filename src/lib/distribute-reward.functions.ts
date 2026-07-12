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
    let rewardAuthId: string | undefined;
    const { getSupabasePublic } = await import("./supabase-public.server");
    const supabasePublic = getSupabasePublic();
    const setRewardStatus = async (
      status: "pending" | "sent" | "confirmed" | "failed" | "skipped",
      txHash?: string,
      errorMessage?: string,
      paidAt?: string,
    ) => {
      if (!rewardAuthId) return;
      const { error } = await supabasePublic.rpc("set_reward_payout_status", {
        _id: rewardAuthId,
        _status: status,
        _tx_hash: txHash,
        _error_message: errorMessage,
        _paid_at: paidAt,
      });
      if (error) {
        console.error("[reward] failed to update payout status", {
          rewardAuthId,
          status,
          error: error.message,
        });
      }
    };

    try {
      console.info("[reward] ✓ Saving payout record", { claimId, wallet: normalizedWallet, amount });
      const { data: rewardRowId, error: rewardInsertError } = await supabasePublic.rpc("begin_reward_payout", {
        _wallet: normalizedWallet,
        _pack_id: data.packId,
        _amount_usdm: amount,
        _nonce: data.nonce,
        _claim_id: claimId,
      });

      if (rewardInsertError) {
        console.error("[reward] ✗ Saving payout record failed", {
          error: rewardInsertError.message,
          details: rewardInsertError,
          claimId,
          wallet: normalizedWallet,
        });
        return {
          ok: false,
          error: `Saving payout record failed: ${rewardInsertError.message}`,
          step: "saving_reward_status",
          claimId,
        };
      }
      rewardAuthId = rewardRowId ?? undefined;
      console.info("[reward] ✓ Payout record saved", { rewardAuthId, claimId });
    } catch (dbError) {
      const msg = (dbError as Error)?.message ?? String(dbError);
      console.error("[reward] ✗ Loading database client or saving payout record failed", {
        error: msg,
        stack: (dbError as Error)?.stack,
        claimId,
      });
      return {
        ok: false,
        error: `Saving payout record failed: ${msg}`,
        step: "saving_reward_status",
        claimId,
      };
    }

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
        await setRewardStatus("failed", undefined, `Wrong chain id ${chainId}`);
        return { ok: false, error: `Wrong chain id ${chainId}; expected Celo mainnet`, step: "chain_check", claimId };
      }

      const signerCelo = await publicClient.getBalance({ address: account.address });
      console.info("[reward] ✓ Signer gas balance checked", {
        signer: account.address,
        celoWei: signerCelo.toString(),
      });
      if (signerCelo <= 0n) {
        await setRewardStatus("failed", undefined, "Backend signer has no CELO for gas");
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
        await setRewardStatus("failed", undefined, "Backend signer is not authorised as rewarder");
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
        await setRewardStatus("skipped", undefined, "Claim already used on-chain");
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
        await setRewardStatus(
          "failed",
          undefined,
          `Reward contract underfunded: have ${treasuryBal.toString()}, need ${amountWei.toString()}`,
        );
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
      await setRewardStatus("sent", hash);

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
        await setRewardStatus("failed", hash, "Transaction reverted");
      }

      if (ok) {
        console.info("[reward] ✓ Updating reward status", { rewardAuthId, hash });
        await setRewardStatus("confirmed", hash, undefined, new Date().toISOString());
        try {
          const { error: statsError } = await supabasePublic.rpc("add_confirmed_reward_total", {
            _amount_usdm: amount,
          });
          if (statsError) throw statsError;
        } catch (statsError) {
          console.error("[reward] failed to update paid reward stats", {
            error: (statsError as Error)?.message ?? String(statsError),
            hash,
            amount,
          });
        }
        console.info("[reward] ✓ Success", { hash, amount, claimId });
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
      await setRewardStatus("failed", undefined, msg.slice(0, 500));
      return { ok: false, error: msg.slice(0, 300) || "send_failed" };
    }
  });
