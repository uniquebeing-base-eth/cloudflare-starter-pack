// Server function that signs reward authorizations with BACKEND_SIGNER_KEY.
// The signed payload can be relayed to the RewardDistributor contract.
// Auth: caller must be signed in (requireSupabaseAuth) so we bind the reward
// to a specific user and prevent client-side minting attempts.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRuntimeEnv, normalizePrivateKey } from "./reward-distribution";

const RewardInput = z.object({
  wallet: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  packId: z.enum(["starter", "mystery", "alpha", "legendary", "explorer"]),
  amountUsdm: z.number().min(0).max(20),
  nonce: z.string().min(1).max(128),
});

export const signReward = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RewardInput.parse(raw))
  .handler(async ({ data, context }) => {
    const runtimeEnv = getRuntimeEnv();
    const pk = normalizePrivateKey(runtimeEnv.BACKEND_SIGNER_KEY || runtimeEnv.VITE_BACKEND_SIGNER_KEY);
    if (!pk) throw new Error("BACKEND_SIGNER_KEY not configured");

    const { privateKeyToAccount } = await import("viem/accounts");
    const { parseUnits, encodePacked, keccak256 } = await import("viem");
    const account = privateKeyToAccount(pk as `0x${string}`);
    const amountWei = parseUnits(data.amountUsdm.toString(), 18);
    // Simple EIP-191 packed hash: (wallet, packId, amount, nonce, userId)
    const hash = keccak256(
      encodePacked(
        ["address", "string", "uint256", "string", "string"],
        [data.wallet as `0x${string}`, data.packId, amountWei, data.nonce, context.userId],
      ),
    );
    const signature = await account.signMessage({ message: { raw: hash } });
    console.info("[reward] signReward generated", { signer: account.address, hash, signature });

    // Log the authorization for the leaderboard/history.
    try {
      await context.supabase.from("reward_auth").insert({
        user_id: context.userId,
        wallet: data.wallet.toLowerCase(),
        pack_id: data.packId,
        amount_usdm: data.amountUsdm,
        nonce: data.nonce,
      });
    } catch (e) {
      console.warn("[reward] signReward: failed to insert reward_auth", { error: (e as Error)?.message ?? e, data: { userId: context.userId, wallet: data.wallet, packId: data.packId } });
    }

    return {
      signer: account.address,
      hash,
      signature,
      amountWei: amountWei.toString(),
    };
  });
