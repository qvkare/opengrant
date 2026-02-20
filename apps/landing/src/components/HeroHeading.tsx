"use client";

import { Typewriter } from "@/components/ui/typewriter";

export function HeroHeading() {
  return (
    <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.15] text-white">
      Monetize Your
      {/* Fixed height = 2 lines × line-height(1.15) → prevents layout jump */}
      <span className="block min-h-[2.3em]">
        <Typewriter
          text={[
            "Open Source APIs",
            "Dependency Trees",
            "x402 Payments",
            "USDC Escrow",
            "API Endpoints",
            "Open Source Work",
          ]}
          speed={60}
          deleteSpeed={35}
          waitTime={2200}
          className="text-white/40"
          cursorChar="_"
          cursorClassName="ml-0.5 text-white/30"
        />
      </span>
    </h1>
  );
}
