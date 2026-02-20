"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { APP_URL } from "@/lib/utils";

function Logo() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      className="text-white"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="26" height="26" rx="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M18 7 H9 A2 2 0 0 0 7 9 V19 A2 2 0 0 0 9 21 H19 A2 2 0 0 0 21 19 V14 H14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="14" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function Header() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed w-full z-50 transition-[background-color,backdrop-filter,box-shadow] duration-500 border-b ${
        scrolled
          ? "bg-white/[0.06] backdrop-blur-2xl saturate-150 border-white/[0.12] shadow-[0_4px_40px_rgba(0,0,0,0.4)]"
          : "bg-transparent border-transparent"
      }`}
    >
      {/* Subtle inner highlight line at top when scrolled */}
      <div
        className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent transition-opacity duration-500 ${
          scrolled ? "opacity-100" : "opacity-0"
        }`}
      />

      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <Logo />
            <span className="font-semibold text-xl tracking-tight text-white">
              OpenGrant
            </span>
          </Link>
        </div>

        <div className="hidden md:flex items-center gap-10 text-sm font-medium text-white/60">
          <a
            href="#how-it-works"
            className="hover:text-white transition-colors duration-200"
          >
            How it works
          </a>
          <a href="#features" className="hover:text-white transition-colors duration-200">
            Features
          </a>
          <a
            href="https://docs.opengrant.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors duration-200"
          >
            Documentation
          </a>
        </div>

        <div className="flex items-center gap-4">
          <a
            href={`${APP_URL}/auth`}
            className="text-sm font-medium text-white/60 hover:text-white hidden sm:block transition-colors duration-200"
          >
            Log in
          </a>
          <a
            href={`${APP_URL}/fund`}
            className="bg-white text-black px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-white/90 transition-all duration-200 shadow-[0_0_20px_rgba(255,255,255,0.15)]"
          >
            Start Earning
          </a>
        </div>
      </div>
    </nav>
  );
}
