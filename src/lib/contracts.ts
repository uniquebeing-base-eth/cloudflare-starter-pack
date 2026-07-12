// Shreds smart-contract addresses & ABIs on Celo mainnet.
// USDM (Mento) address on Celo — override with VITE_USDM_ADDRESS if needed.
export const CELO_CHAIN_ID = 42220;
export const CELO_CHAIN_HEX = "0xa4ec";

export const USDM_ADDRESS =
  (import.meta as unknown as { env?: Record<string, string> }).env
    ?.VITE_USDM_ADDRESS ||
  "0x765de816845861e75a25fca122bb6898b8b1282a"; // Official USDM stablecoin on Celo

export const PAYMENT_CONTRACT = "0xf01d7d3a57af16c47bc330c48c5e201cebbf054e";
export const REWARDS_CONTRACT = "0x16dd07bd11524de1d904cde7dfd326c7772c8608";
export const USERNAME_CONTRACT = "0xb1ce5a24ab458a8fde04e0df9bfe86908515c90b";

// RewardDistributor ABI — matches the deployed 6-arg distribute() signature.
// distribute(bytes32 claimId, address player, uint256 packKey,
//            uint256 celoAmount, address[] tokens, uint256[] amounts)
// Also exposes claimed[bytes32] and rewarders[address] views for pre-flight.
export const REWARDS_ABI = [
  {
    inputs: [
      { internalType: "bytes32", name: "claimId", type: "bytes32" },
      { internalType: "address", name: "player", type: "address" },
      { internalType: "uint256", name: "packKey", type: "uint256" },
      { internalType: "uint256", name: "celoAmount", type: "uint256" },
      { internalType: "address[]", name: "tokens", type: "address[]" },
      { internalType: "uint256[]", name: "amounts", type: "uint256[]" },
    ],
    name: "distribute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "bytes32", name: "", type: "bytes32" }],
    name: "claimed",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "rewarders",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Pack IDs per user spec: 1=Mystery, 2=Alpha, 3=Legendary, 4=Explorer.
// Starter is FREE and off-chain.
export const PACK_KEY: Record<string, number | null> = {
  starter: null,
  mystery: 1,
  alpha: 2,
  legendary: 3,
  explorer: 4,
};

export const PACK_PRICE_USDM: Record<string, string> = {
  starter: "0",
  mystery: "0.25",
  alpha: "0.75",
  legendary: "1.50",
  explorer: "3.00",
};

/* -------- ABIs (only functions we call) -------- */

export const USERNAME_ABI = [
  { inputs: [{ internalType: "string", name: "username", type: "string" }], name: "isAvailable", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "address", name: "wallet", type: "address" }], name: "isRegistered", outputs: [{ type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [{ internalType: "string", name: "username", type: "string" }], name: "registerUser", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ internalType: "address", name: "", type: "address" }], name: "usernameOf", outputs: [{ type: "string" }], stateMutability: "view", type: "function" },
] as const;

export const PAYMENT_ABI = [
  {
    inputs: [
      { internalType: "uint8", name: "packKey", type: "uint8" },
      { internalType: "address", name: "token", type: "address" },
      { internalType: "bytes32", name: "orderId", type: "bytes32" },
    ],
    name: "buyWithToken",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint8", name: "", type: "uint8" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "prices",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Minimal ERC20 (approve + allowance + balance)
export const ERC20_ABI = [
  { inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "decimals", outputs: [{ type: "uint8" }], stateMutability: "view", type: "function" },
] as const;
