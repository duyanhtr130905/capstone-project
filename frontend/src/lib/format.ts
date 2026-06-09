import { formatEther, parseEther } from "viem";

export function shortAddress(address?: string) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatToken(value?: bigint, maxDecimals = 4) {
  if (value === undefined) return "0";

  const formatted = formatEther(value);
  const [whole, decimals = ""] = formatted.split(".");
  const trimmedDecimals = decimals.slice(0, maxDecimals).replace(/0+$/, "");

  return trimmedDecimals === "" ? whole : `${whole}.${trimmedDecimals}`;
}

export function formatTokenWithSymbol(
  value: bigint | undefined,
  symbol: string,
  maxDecimals = 4,
) {
  return `${formatToken(value, maxDecimals)} ${symbol}`;
}

export function parseTokenAmount(input: string) {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{0,18})?$/.test(trimmed)) return null;

  try {
    return parseEther(trimmed);
  } catch {
    return null;
  }
}

export function formatPercent(value: number) {
  return `${Math.min(100, Math.max(0, value)).toFixed(0)}%`;
}
