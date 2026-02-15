"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

const Providers = dynamic(
  () => import("@/components/providers").then((mod) => mod.Providers),
  { ssr: false }
);
const Header = dynamic(
  () => import("@/components/header").then((mod) => mod.Header),
  { ssr: false }
);

export function ClientShell({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <div className="relative flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <footer className="bg-gray-50 border-t border-gray-100 py-8 px-6 text-sm">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-gray-400">
            <p>
              &copy; {new Date().getFullYear()} OpenGrant. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a
                href="https://opengrant.dev/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-black transition-colors"
              >
                Privacy
              </a>
              <a
                href="https://opengrant.dev/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-black transition-colors"
              >
                Terms
              </a>
              <a
                href="https://github.com/qvkare/opengrant"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-black transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </footer>
      </div>
    </Providers>
  );
}
