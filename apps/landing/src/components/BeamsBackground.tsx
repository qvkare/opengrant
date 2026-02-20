"use client";

import dynamic from "next/dynamic";

const Beams = dynamic(() => import("./Beams"), { ssr: false });

export function BeamsBackground() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none">
      <Beams
        beamWidth={3.2}
        beamHeight={25}
        beamNumber={36}
        lightColor="#ffffff"
        speed={5.3}
        noiseIntensity={1.75}
        scale={0.09}
        rotation={341}
      />
    </div>
  );
}
