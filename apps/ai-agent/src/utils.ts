/**
 * Utility functions for the AI Agent
 */

const USDC_DECIMALS = 6;

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a USDC wei amount (e.g. "1000000") to human-readable (e.g. "$1.000000 USDC").
 * Also handles already-formatted amounts with a decimal point.
 */
export function formatUSDC(amount: string): string {
  if (amount.includes(".")) {
    // Already formatted (e.g. from getBalance().usdcFormatted)
    const num = parseFloat(amount);
    return `$${num.toFixed(6)} USDC`;
  }
  // Wei format — divide by 10^6
  const wei = BigInt(amount || "0");
  const whole = wei / BigInt(10 ** USDC_DECIMALS);
  const frac = wei % BigInt(10 ** USDC_DECIMALS);
  const fracStr = frac.toString().padStart(USDC_DECIMALS, "0");
  return `$${whole}.${fracStr} USDC`;
}

export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}
