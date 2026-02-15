import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Validated APP_URL - only allows opengrant.dev subdomains or localhost.
 * Prevents open redirect if NEXT_PUBLIC_APP_URL is tampered with.
 */
function validateAppUrl(url: string): string {
  const fallback = "https://app.opengrant.dev";
  try {
    const parsed = new URL(url);
    const isOpenGrant =
      parsed.hostname === "app.opengrant.dev" ||
      parsed.hostname.endsWith(".opengrant.dev");
    const isLocalhost =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const safeProtocol =
      parsed.protocol === "https:" || (isLocalhost && parsed.protocol === "http:");
    if (safeProtocol && (isOpenGrant || isLocalhost)) {
      return parsed.origin;
    }
  } catch {
    // invalid URL
  }
  return fallback;
}

export const APP_URL = validateAppUrl(
  process.env.NEXT_PUBLIC_APP_URL || "https://app.opengrant.dev"
);
