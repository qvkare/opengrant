import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ClientShell } from "@/components/client-shell";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "OpenGrant - Monetize Your Open Source APIs",
  description:
    "Crypto-native API marketplace for open-source monetization using x402 micropayments and Chainlink CRE.",
  keywords: ["open source", "api", "micropayments", "x402", "crypto", "blockchain"],
  authors: [{ name: "OpenGrant" }],
  openGraph: {
    title: "OpenGrant - Monetize Your Open Source APIs",
    description: "Crypto-native API marketplace for open-source monetization",
    url: "https://opengrant.dev",
    siteName: "OpenGrant",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenGrant",
    description: "Crypto-native API marketplace for open-source monetization",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
