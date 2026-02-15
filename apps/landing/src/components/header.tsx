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
      className="text-black"
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
    const handleScroll = () => setScrolled(window.scrollY > 0);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed w-full bg-white/90 backdrop-blur-md z-50 border-b border-gray-100 transition-all duration-300 ${
        scrolled ? "shadow-sm" : ""
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3">
            <Logo />
            <span className="font-semibold text-xl tracking-tight">
              OpenGrant
            </span>
          </Link>
        </div>

        <div className="hidden md:flex items-center gap-10 text-sm font-medium text-gray-500">
          <a
            href="#how-it-works"
            className="hover:text-black transition-colors"
          >
            How it works
          </a>
          <a href="#features" className="hover:text-black transition-colors">
            Features
          </a>
          <a
            href="https://github.com/qvkare/opengrant#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-black transition-colors"
          >
            Documentation
          </a>
        </div>

        <div className="flex items-center gap-6">
          <a
            href={`${APP_URL}/auth`}
            className="text-sm font-medium text-gray-600 hover:text-black hidden sm:block transition-colors"
          >
            Log in
          </a>
          <a
            href={`${APP_URL}/auth`}
            className="bg-black text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors shadow-sm"
          >
            Start Earning
          </a>
        </div>
      </div>
    </nav>
  );
}
