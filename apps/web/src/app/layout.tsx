import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ClientShell } from "@/components/client-shell";

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
  title: "OpenGrant App",
  description:
    "Explore, publish, and manage APIs on the OpenGrant marketplace.",
  openGraph: {
    title: "OpenGrant App",
    description:
      "Explore, publish, and manage APIs on the OpenGrant marketplace.",
    url: "https://app.opengrant.dev",
    siteName: "OpenGrant",
    type: "website",
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
        <ClientShell>{children}</ClientShell>
      </body>
    </html>
  );
}
