import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

const inter = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "OpenGrant - Monetize Your Open Source APIs",
  description:
    "Transform free APIs into revenue streams with HTTP-native micropayments. AI agents pay per call. No subscriptions. No friction.",
  keywords: [
    "open source",
    "api",
    "micropayments",
    "x402",
    "crypto",
    "blockchain",
    "monetization",
  ],
  authors: [{ name: "OpenGrant" }],
  openGraph: {
    title: "OpenGrant - Monetize Your Open Source APIs",
    description:
      "Crypto-native API marketplace for open-source monetization using x402 micropayments and Chainlink CRE.",
    url: "https://opengrant.dev",
    siteName: "OpenGrant",
    type: "website",
    images: [
      {
        url: "https://opengrant.dev/og-image.png",
        width: 1200,
        height: 630,
        alt: "OpenGrant - Monetize Your Open Source APIs",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenGrant",
    description:
      "Crypto-native API marketplace for open-source monetization",
    images: ["https://opengrant.dev/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased selection:bg-black selection:text-white`}
      >
        <Header />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  );
}
