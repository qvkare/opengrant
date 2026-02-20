import { APP_URL } from "@/lib/utils";
import { BeamsBackground } from "@/components/BeamsBackground";
import { HeroHeading } from "@/components/HeroHeading";

/* ─────────────────── Hero ─────────────────── */

function HeroSection() {
  return (
    <section className="pt-40 pb-24 px-6 relative overflow-hidden">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
        <div className="space-y-10 relative z-10">
          <HeroHeading />

          <p className="text-xl text-white/60 leading-relaxed max-w-lg font-light">
            Transform free APIs into revenue streams with HTTP-native
            micropayments. AI agents pay per call. No subscriptions. No
            friction.
          </p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pt-4">
            <a
              href={`${APP_URL}/fund`}
              className="w-full sm:w-auto bg-white text-black px-8 py-4 rounded-xl font-medium hover:bg-white/90 transition-all flex items-center justify-center gap-2 group shadow-[0_0_30px_rgba(255,255,255,0.15)]"
            >
              Start Earning
              <svg
                className="w-4 h-4 group-hover:translate-x-1 transition-transform"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 8l4 4m0 0l-4 4m4-4H3"
                />
              </svg>
            </a>
            <a
              href={`${APP_URL}/explore`}
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-medium border border-white/20 hover:border-white/50 transition-colors text-center text-white/80 hover:text-white backdrop-blur-sm"
            >
              Explore APIs
            </a>
          </div>
        </div>

        {/* Protocol Animation */}
        <div className="relative h-[450px] w-full bg-white/[0.04] rounded-2xl border border-white/10 flex items-center justify-center overflow-hidden backdrop-blur-sm">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff08_1px,transparent_1px),linear-gradient(to_bottom,#ffffff08_1px,transparent_1px)] bg-[size:24px_24px]" />
          <svg
            viewBox="0 0 520 340"
            className="w-full h-full relative z-10 p-4"
            role="img"
            aria-label="OpenGrant protocol flow: Consumer pays via x402, gateway verifies and forwards to API, CRE oracle settles USDC to publisher wallet"
          >
            {/* ── NODES: Top Row ── */}

            {/* Consumer / AI Agent */}
            <g>
              <circle cx="65" cy="100" r="32" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <path d="M53,92 H77 M53,100 H77 M53,108 H69" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round" />
              <text x="65" y="150" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="12" fill="rgba(255,255,255,0.8)">Consumer</text>
              <text x="65" y="164" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.4)">AI Agent</text>
            </g>

            {/* OpenGrant Gateway */}
            <g>
              <rect x="174" y="58" width="92" height="84" rx="14" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <g transform="translate(202, 82) scale(1.286)">
                <rect x="1" y="1" width="26" height="26" rx="4" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.17" />
                <path d="M18 7 H9 A2 2 0 0 0 7 9 V19 A2 2 0 0 0 9 21 H19 A2 2 0 0 0 21 19 V14 H14" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.17" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="14" cy="14" r="1.5" fill="white">
                  <animate attributeName="r" values="1.5;2.5;1.5" dur="3s" repeatCount="indefinite" />
                </circle>
              </g>
              <text x="220" y="162" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="12" fill="rgba(255,255,255,0.8)">OpenGrant</text>
              <text x="220" y="176" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.4)">x402 Gateway</text>
            </g>

            {/* Your API */}
            <g>
              <rect x="364" y="62" width="72" height="76" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <line x1="376" y1="80" x2="424" y2="80" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <line x1="376" y1="92" x2="418" y2="92" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <line x1="376" y1="104" x2="408" y2="104" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <line x1="376" y1="116" x2="414" y2="116" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <text x="400" y="158" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="12" fill="rgba(255,255,255,0.8)">Your API</text>
            </g>

            {/* ── FLOW LINES ── */}

            <line x1="97" y1="100" x2="174" y2="100" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeDasharray="4 4" />
            <rect x="117" y="82" width="36" height="14" rx="3" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
            <text x="135" y="92" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(255,255,255,0.4)">x402</text>

            <circle cx="97" cy="100" r="11" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
              <animate attributeName="cx" values="97;174;174" keyTimes="0;0.7;1" dur="3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" dur="3s" repeatCount="indefinite" />
            </circle>
            <text x="97" y="104" fontFamily="JetBrains Mono, monospace" fontSize="12" textAnchor="middle" fill="white" fontWeight="500">
              $
              <animate attributeName="x" values="97;174;174" keyTimes="0;0.7;1" dur="3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" dur="3s" repeatCount="indefinite" />
            </text>

            <line x1="266" y1="100" x2="364" y2="100" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeDasharray="4 4" />
            <rect x="297" y="84" width="36" height="16" rx="4" fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
            <text x="315" y="96" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.6)">REQ</text>

            <circle cx="266" cy="100" r="4" fill="white">
              <animate attributeName="cx" values="266;364;364" keyTimes="0;0.7;1" dur="2.5s" begin="1s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" dur="2.5s" begin="1s" repeatCount="indefinite" />
            </circle>

            <path d="M400 138 C400 210, 65 210, 65 132" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="4 4">
              <animate attributeName="stroke-dashoffset" from="0" to="-20" dur="2s" repeatCount="indefinite" />
            </path>
            <text x="232" y="216" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.25)">200 OK · JSON</text>

            {/* ── NODES: Bottom Row ── */}

            <line x1="220" y1="142" x2="220" y2="240" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="4 4" />
            <text x="234" y="195" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(255,255,255,0.35)">verify</text>

            <circle cx="220" cy="142" r="3" fill="rgba(255,255,255,0.5)">
              <animate attributeName="cy" values="142;240;240" keyTimes="0;0.7;1" dur="2s" begin="1.5s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" dur="2s" begin="1.5s" repeatCount="indefinite" />
            </circle>

            {/* CRE / Chainlink Oracle */}
            <g>
              <polygon points="220,240 248,256 248,288 220,304 192,288 192,256" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <circle cx="220" cy="272" r="5" fill="white" />
              <text x="220" y="322" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="11" fill="rgba(255,255,255,0.8)">CRE</text>
              <text x="220" y="335" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.4)">Chainlink</text>
            </g>

            <line x1="248" y1="272" x2="370" y2="272" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" strokeDasharray="4 4" />
            <text x="309" y="262" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="rgba(255,255,255,0.35)">settle</text>

            <circle cx="248" cy="272" r="9" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5">
              <animate attributeName="cx" values="248;370;370" keyTimes="0;0.7;1" dur="3s" begin="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" dur="3s" begin="2s" repeatCount="indefinite" />
            </circle>
            <text x="248" y="276" fontFamily="JetBrains Mono, monospace" fontSize="10" textAnchor="middle" fill="white">
              $
              <animate attributeName="x" values="248;370;370" keyTimes="0;0.7;1" dur="3s" begin="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" dur="3s" begin="2s" repeatCount="indefinite" />
            </text>

            {/* Publisher Wallet */}
            <g>
              <circle cx="400" cy="272" r="28" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <rect x="387" y="261" width="26" height="20" rx="3" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              <line x1="387" y1="267" x2="413" y2="267" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
              <circle cx="407" cy="274" r="2" fill="white" />
              <text x="400" y="318" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="11" fill="rgba(255,255,255,0.8)">Wallet</text>
              <text x="400" y="331" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="rgba(255,255,255,0.4)">publisher</text>
            </g>

            <path d="M400 138 L400 244" stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="3 3" />
            <text x="412" y="195" fontFamily="JetBrains Mono, monospace" fontSize="7" fill="rgba(255,255,255,0.1)">log</text>
          </svg>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── Stats ─────────────────── */

function StatsSection() {
  return (
    <section className="border-y border-white/10 bg-white/[0.03] backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex flex-col items-center text-center space-y-1">
            <span className="text-4xl font-mono font-medium tracking-tighter text-white">
              $0.001
            </span>
            <span className="text-xs text-white/40 uppercase tracking-widest font-medium">
              Minimum Payment
            </span>
          </div>
          <div className="flex flex-col items-center text-center space-y-1 md:border-x md:border-white/10 md:px-12">
            <span className="text-4xl font-mono font-medium tracking-tighter text-white">
              ~2s
            </span>
            <span className="text-xs text-white/40 uppercase tracking-widest font-medium">
              Settlement Time
            </span>
          </div>
          <div className="flex flex-col items-center text-center space-y-1">
            <span className="text-4xl font-mono font-medium tracking-tighter text-white">
              0%
            </span>
            <span className="text-xs text-white/40 uppercase tracking-widest font-medium">
              Escrow Fee
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── Features ─────────────────── */

function FeatureCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group cursor-default">
      <div className="h-56 mb-8 border border-white/10 rounded-2xl bg-white/[0.04] p-8 flex items-center justify-center overflow-hidden relative backdrop-blur-sm transition-all duration-300 group-hover:border-white/20 group-hover:bg-white/[0.07]">
        {children}
      </div>
      <h3 className="text-xl font-medium mb-3 text-white">{title}</h3>
      <p className="text-sm text-white/50 leading-relaxed font-light">
        {description}
      </p>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="py-32 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-20 max-w-2xl">
          <h2 className="text-3xl sm:text-4xl font-semibold mb-6 tracking-tight text-white">
            Why Open Source Projects <br />
            Choose OpenGrant
          </h2>
          <p className="text-white/50 text-lg font-light">
            Built for the modern web stack. We handle the complexity of
            micropayments so you can focus on building great software.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-16">
          {/* HTTP-Native Payments */}
          <FeatureCard
            title="HTTP-Native Payments"
            description="Built on x402 protocol standards. Accept payments directly via HTTP status codes and headers without complex SDKs."
          >
            <svg
              width="200"
              height="120"
              viewBox="0 0 200 120"
              className="relative z-10 transition-transform duration-500 group-hover:scale-105"
              aria-hidden="true"
            >
              <line x1="20" y1="60" x2="180" y2="60" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeDasharray="4 4" />
              <rect x="30" y="45" width="40" height="30" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <text x="50" y="64" fontFamily="JetBrains Mono, monospace" fontSize="10" textAnchor="middle" fill="rgba(255,255,255,0.8)">402</text>
              <rect x="130" y="45" width="40" height="30" rx="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <text x="150" y="64" fontFamily="JetBrains Mono, monospace" fontSize="10" textAnchor="middle" fill="rgba(255,255,255,0.8)">200</text>
              <circle cx="100" cy="60" r="12" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
              <path d="M96 60 L104 60 M100 56 L100 64" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
            </svg>
          </FeatureCard>

          {/* Verified by Chainlink */}
          <FeatureCard
            title="Verified by Chainlink"
            description="Decentralized oracle networks verify every API call authenticity before settlement ensuring trustless operations."
          >
            <svg
              width="200"
              height="120"
              viewBox="0 0 200 120"
              className="relative z-10 transition-transform duration-500 group-hover:translate-y-[-5px]"
              aria-hidden="true"
            >
              <path d="M100 30 L125 45 L125 75 L100 90 L75 75 L75 45 Z" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              <circle cx="100" cy="60" r="4" fill="white" />
              <path d="M40 45 L65 60 L65 90" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <path d="M160 45 L135 60 L135 90" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <line x1="75" y1="60" x2="65" y2="60" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
              <line x1="125" y1="60" x2="135" y2="60" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
            </svg>
          </FeatureCard>

          {/* 5-Minute Integration */}
          <FeatureCard
            title="5-Minute Integration"
            description="Drop-in SDKs for Node, Python, and Go. Middleware that handles the payment handshake automatically."
          >
            <div className="w-full max-w-[220px] bg-white/[0.06] border border-white/10 rounded-lg p-4 relative z-10 transition-transform duration-500 group-hover:-translate-y-2 backdrop-blur-sm">
              <div className="flex gap-1.5 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
                <div className="w-2.5 h-2.5 rounded-full bg-white/20" />
              </div>
              <div className="font-mono text-[11px] text-white/40 leading-5">
                <span className="text-white">import</span>{" "}
                {`{ grant }`}{" "}
                <span className="text-white">from</span>{" "}
                {`'sdk'`};
                <br />
                <br />
                <span className="text-white/30">{"// Initialize"}</span>
                <br />
                <span className="text-white">const</span> app ={" "}
                <span className="text-blue-300">grant</span>(key);
                <br />
                app.<span className="text-blue-300">listen</span>(3000);
              </div>
            </div>
          </FeatureCard>

          {/* AI Agent Ready */}
          <FeatureCard
            title="AI Agent Ready"
            description="Designed for the autonomous economy. LLMs and agents can discover, negotiate, and pay for your API autonomously."
          >
            <svg
              width="200"
              height="120"
              viewBox="0 0 200 120"
              className="relative z-10 transition-transform duration-500 group-hover:scale-105"
              aria-hidden="true"
            >
              <rect x="75" y="35" width="50" height="50" rx="10" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" />
              <path d="M90 50 H110 M90 60 H110 M90 70 H110" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
              <path d="M75 45 H60 M75 60 H60 M75 75 H60" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              <path d="M125 45 H140 M125 60 H140 M125 75 H140" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
              <circle cx="60" cy="45" r="2" fill="white" />
              <circle cx="140" cy="75" r="2" fill="white" />
            </svg>
          </FeatureCard>

          {/* Revenue Splitting */}
          <FeatureCard
            title="Revenue Splitting"
            description="Define contribution graphs. Automatically split revenue with dependencies, maintainers, or community treasuries."
          >
            <svg
              width="140"
              height="140"
              viewBox="0 0 100 100"
              className="relative z-10 transition-transform duration-700 group-hover:rotate-45"
              aria-hidden="true"
            >
              <circle cx="50" cy="50" r="40" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
              <path d="M50 50 L50 10 A40 40 0 0 1 90 50 Z" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
              <path d="M50 50 L90 50 A40 40 0 0 1 50 90 Z" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
              <path d="M50 50 L50 90 A40 40 0 0 1 10 50 Z" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
              <path d="M50 50 L10 50 A40 40 0 0 1 50 10 Z" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.3)" strokeWidth="1.2" />
              <text x="50" y="54" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="12" textAnchor="middle" fill="white">$</text>
            </svg>
          </FeatureCard>

          {/* Real-Time Analytics */}
          <FeatureCard
            title="Real-Time Analytics"
            description="Monitor usage spikes, revenue flow, and top consumers in real-time with our privacy-focused dashboard."
          >
            <svg
              width="200"
              height="120"
              viewBox="0 0 200 120"
              className="relative z-10 transition-transform duration-500 group-hover:scale-105"
              aria-hidden="true"
            >
              <line x1="20" y1="100" x2="180" y2="100" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
              <polyline points="20,80 50,70 80,75 110,40 140,50 170,20" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
              <circle cx="50" cy="70" r="3" fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
              <circle cx="80" cy="75" r="3" fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
              <circle cx="110" cy="40" r="3" fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
              <circle cx="140" cy="50" r="3" fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
              <circle cx="170" cy="20" r="3" fill="white" />
              <path d="M20 100 L20 80 L50 70 L80 75 L110 40 L140 50 L170 20 V100 H20 Z" fill="white" fillOpacity="0.05" />
            </svg>
          </FeatureCard>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── How It Works ─────────────────── */

function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="py-32 border-y border-white/10 overflow-hidden bg-white/[0.02] backdrop-blur-sm"
    >
      <div className="max-w-5xl mx-auto px-6">
        <div className="text-center mb-24">
          <h2 className="text-3xl font-semibold mb-4 text-white">How It Works</h2>
          <p className="text-white/50">Three simple steps to monetization</p>
        </div>

        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-transparent -ml-[0.5px] border-l border-dashed border-white/20" />

          {/* Step 01 */}
          <div className="relative flex flex-col md:flex-row items-center justify-between mb-32 group">
            <div className="hidden md:block w-5/12 text-right pr-16">
              <h3 className="text-2xl font-medium mb-3 text-white">Register Your API</h3>
              <p className="text-white/50 font-light leading-relaxed">
                Connect your repository and define your pricing model. We
                generate your unique payment gateway instantly.
              </p>
            </div>
            <div className="relative z-10 w-14 h-14 rounded-full bg-white/[0.06] border border-white/20 flex items-center justify-center font-mono font-medium text-lg shadow-sm text-white group-hover:border-white group-hover:bg-white group-hover:text-black transition-all duration-300 backdrop-blur-sm">
              01
            </div>
            <div className="md:hidden w-full pl-20 -mt-10 mb-10">
              <h3 className="text-xl font-medium mb-2 text-white">Register Your API</h3>
              <p className="text-sm text-white/50 font-light">
                Connect your repository and define your pricing model.
              </p>
            </div>
            <div className="w-full md:w-5/12 pl-0 md:pl-16">
              <div className="bg-white/[0.05] p-6 rounded-xl border border-white/10 w-full max-w-sm mx-auto md:mx-0 transition-transform duration-500 group-hover:translate-x-2 backdrop-blur-sm">
                <div className="flex items-center gap-4 mb-4 border-b border-white/10 pb-4">
                  <div className="w-10 h-10 rounded-lg bg-white/[0.08] border border-white/10 flex items-center justify-center text-white/40">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="h-2 w-32 bg-white/10 rounded-full" />
                    <div className="h-2 w-20 bg-white/[0.06] rounded-full" />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs font-mono text-white/40">
                    <span>PRICING_MODEL</span>
                    <span className="text-white bg-white/10 px-2 py-0.5 rounded">PER_CALL</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-mono text-white/40">
                    <span>RATE</span>
                    <span className="text-white">$0.0004</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 02 */}
          <div className="relative flex flex-col md:flex-row-reverse items-center justify-between mb-32 group">
            <div className="hidden md:block w-5/12 text-left pl-16">
              <h3 className="text-2xl font-medium mb-3 text-white">Consumers Pay Per Call</h3>
              <p className="text-white/50 font-light leading-relaxed">
                Users attach a payment token to their requests. Our gateway
                validates funds and routes the request securely.
              </p>
            </div>
            <div className="relative z-10 w-14 h-14 rounded-full bg-white/[0.06] border border-white/20 flex items-center justify-center font-mono font-medium text-lg shadow-sm text-white group-hover:border-white group-hover:bg-white group-hover:text-black transition-all duration-300 backdrop-blur-sm">
              02
            </div>
            <div className="md:hidden w-full pl-20 -mt-10 mb-10">
              <h3 className="text-xl font-medium mb-2 text-white">Consumers Pay Per Call</h3>
              <p className="text-sm text-white/50 font-light">Users attach a payment token to their requests.</p>
            </div>
            <div className="w-full md:w-5/12 pr-0 md:pr-16 flex justify-end">
              <div className="bg-white/[0.05] p-6 rounded-xl border border-white/10 w-full max-w-sm mx-auto md:mx-0 transition-transform duration-500 group-hover:-translate-x-2 backdrop-blur-sm">
                <div className="font-mono text-[10px] text-white/30 mb-3 tracking-widest uppercase">
                  Request Headers
                </div>
                <div className="space-y-2 font-mono text-xs">
                  <div className="p-3 bg-white/[0.04] rounded border border-white/10 text-white/40 flex justify-between">
                    <span className="text-white font-semibold">Authorization</span>
                    <span className="opacity-50">Bearer 402...</span>
                  </div>
                  <div className="p-3 bg-white/[0.04] rounded border border-white/10 text-white/40 flex justify-between">
                    <span className="text-white font-semibold">X-Payment-Hash</span>
                    <span className="opacity-50">0x82a...</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Step 03 */}
          <div className="relative flex flex-col md:flex-row items-center justify-between group">
            <div className="hidden md:block w-5/12 text-right pr-16">
              <h3 className="text-2xl font-medium mb-3 text-white">Get Paid Instantly</h3>
              <p className="text-white/50 font-light leading-relaxed">
                Revenue settles to your wallet in seconds. Configure
                auto-withdrawals, split with contributors, or reinvest.
              </p>
            </div>
            <div className="relative z-10 w-14 h-14 rounded-full bg-white/[0.06] border border-white/20 flex items-center justify-center font-mono font-medium text-lg shadow-sm text-white group-hover:border-white group-hover:bg-white group-hover:text-black transition-all duration-300 backdrop-blur-sm">
              03
            </div>
            <div className="md:hidden w-full pl-20 -mt-10 mb-10">
              <h3 className="text-xl font-medium mb-2 text-white">Get Paid Instantly</h3>
              <p className="text-sm text-white/50 font-light">Revenue settles to your wallet in seconds.</p>
            </div>
            <div className="w-full md:w-5/12 pl-0 md:pl-16">
              <div className="bg-white/[0.05] p-6 rounded-xl border border-white/10 w-full max-w-sm mx-auto md:mx-0 transition-transform duration-500 group-hover:translate-x-2 backdrop-blur-sm">
                <div className="flex items-end gap-3 mb-6">
                  <span className="text-3xl font-mono font-medium tracking-tight text-white">$1,240.50</span>
                  <div className="flex items-center text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded font-mono mb-1 border border-green-400/20">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true" className="mr-1">
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                    12%
                  </div>
                </div>
                <div className="flex gap-2 h-16 items-end px-2">
                  <div className="flex-1 bg-white/10 rounded-t-sm h-[40%] hover:bg-white/20 transition-colors" />
                  <div className="flex-1 bg-white/10 rounded-t-sm h-[60%] hover:bg-white/20 transition-colors" />
                  <div className="flex-1 bg-white/10 rounded-t-sm h-[30%] hover:bg-white/20 transition-colors" />
                  <div className="flex-1 bg-white/10 rounded-t-sm h-[80%] hover:bg-white/20 transition-colors" />
                  <div className="flex-1 bg-white/10 rounded-t-sm h-[50%] hover:bg-white/20 transition-colors" />
                  <div className="flex-1 bg-white rounded-t-sm h-[90%] shadow-lg shadow-white/10" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── CTA ─────────────────── */

function CTASection() {
  return (
    <section className="py-32 px-6">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="text-4xl sm:text-5xl lg:text-6xl font-semibold mb-8 tracking-tight text-white">
          Ready to Monetize Your <br />
          Open Source?
        </h2>
        <p className="text-white/50 text-lg sm:text-xl mb-12 max-w-2xl mx-auto font-light">
          Join developers building the sustainable web. Start accepting payments
          in minutes.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
          <a
            href={`${APP_URL}/auth`}
            className="w-full sm:w-auto bg-white text-black px-10 py-4 rounded-xl font-medium hover:bg-white/90 transition-all shadow-[0_0_40px_rgba(255,255,255,0.15)]"
          >
            Create Free Account
          </a>
          <a
            href="https://github.com/qvkare/opengrant#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-10 py-4 rounded-xl font-medium border border-white/20 hover:border-white/50 transition-colors text-center text-white/70 hover:text-white"
          >
            Read the Docs
          </a>
        </div>

        <div className="mt-24 pt-16 border-t border-white/10">
          <p className="text-xs font-mono text-white/30 mb-8 uppercase tracking-widest">
            Deployed on
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-14 opacity-30 hover:opacity-70 transition-all duration-700">
            <span className="font-bold text-2xl font-sans tracking-tight text-white">Base</span>
            <span className="font-bold text-2xl font-sans tracking-tight text-white">Arbitrum</span>
            <span className="font-bold text-2xl font-sans tracking-tight text-white">Linea</span>
            <span className="font-bold text-2xl font-sans tracking-tight text-white">Polygon</span>
            <span className="font-bold text-2xl font-sans tracking-tight text-white">Ethereum</span>
            <span className="font-bold text-2xl font-sans tracking-tight text-white">World Chain</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── Page ─────────────────── */

export default function LandingPage() {
  return (
    <div className="relative">
      <BeamsBackground />
      <div className="relative z-10">
        <HeroSection />
        <StatsSection />
        <FeaturesSection />
        <HowItWorksSection />
        <CTASection />
      </div>
    </div>
  );
}
