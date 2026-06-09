import type { Address } from "viem";

export const SEPOLIA_CHAIN_ID = 11155111;

export const contracts = {
  stakingRewards: "0x8B30864bEF5B75C39D19Af249D6bbC4210B55963",
  stakingToken: "0x69F9e365D78dCB684DDe29ea6A05854273917db8",
  rewardsToken: "0x20bF1B78E8B13B3273a27979725Faf1B74902e07",
} as const satisfies Record<string, Address>;

export const ETHERSCAN_BASE_URL = "https://sepolia.etherscan.io";

export const SEPOLIA_RPC_URLS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://11155111.rpc.thirdweb.com",
] as const;

export const zeroAddress =
  "0x0000000000000000000000000000000000000000" as const;
