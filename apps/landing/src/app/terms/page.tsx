import type { Metadata } from "next";
import Link from "next/link";
import { APP_URL } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Terms of Service - OpenGrant",
  description:
    "Terms of Service for the OpenGrant API marketplace. Wallet-based authentication, USDC payments, and platform policies.",
  openGraph: {
    title: "Terms of Service - OpenGrant",
    description:
      "Terms of Service for the OpenGrant API marketplace.",
    url: "https://opengrant.dev/terms",
    siteName: "OpenGrant",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Terms of Service - OpenGrant",
    description:
      "Terms of Service for the OpenGrant API marketplace.",
  },
};

const tocItems = [
  { id: "acceptance", label: "Acceptance of Terms" },
  { id: "description", label: "Description of Service" },
  { id: "authentication", label: "Wallet-Based Authentication" },
  { id: "publishers", label: "Publisher Responsibilities" },
  { id: "consumers", label: "Consumer Responsibilities" },
  { id: "payments", label: "Payments and Fees" },
  { id: "liability", label: "Limitation of Liability" },
  { id: "modifications", label: "Modifications" },
  { id: "contact", label: "Contact" },
];

export default function TermsPage() {
  return (
    <>
      {/* ── Hero Header ── */}
      <section className="pt-40 pb-16 px-6 relative overflow-hidden border-b border-gray-100">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="max-w-4xl mx-auto relative z-10">
          <nav className="flex items-center gap-2 text-sm text-gray-400 mb-8 font-mono">
            <Link
              href="/"
              className="hover:text-black transition-colors"
            >
              Home
            </Link>
            <span className="text-gray-300">/</span>
            <span className="text-black">Terms of Service</span>
          </nav>

          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight mb-6">
            Terms of Service
          </h1>
          <p className="text-lg text-gray-500 font-light max-w-xl mb-8">
            By using OpenGrant you agree to these terms. We&apos;ve kept them
            straightforward &mdash; no surprises.
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-xs font-mono text-gray-500">
            <span className="relative flex h-1.5 w-1.5">
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-gray-400" />
            </span>
            Last updated: February 2026
          </div>
        </div>
      </section>

      {/* ── Content ── */}
      <section className="py-20 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_200px] gap-16">
          {/* ── Main Content ── */}
          <div className="space-y-16">
            {/* 01 */}
            <div id="acceptance" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  01
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">
                Acceptance of Terms
              </h2>
              <p className="text-gray-500 font-light leading-relaxed">
                By accessing or using the OpenGrant platform
                (&ldquo;Service&rdquo;), you agree to be bound by these Terms
                of Service. If you do not agree to these terms, do not use the
                Service.
              </p>
            </div>

            {/* 02 */}
            <div id="description" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  02
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">
                Description of Service
              </h2>
              <p className="text-gray-500 font-light leading-relaxed mb-6">
                OpenGrant is an API marketplace that enables open-source
                developers to monetize their APIs through x402 micropayments.
                The platform facilitates connections between API publishers and
                consumers using blockchain-based payment infrastructure.
              </p>
              <div className="p-5 rounded-xl bg-gray-50/50 border border-gray-100 font-mono text-xs text-gray-500 space-y-2">
                <div className="flex justify-between">
                  <span>Protocol</span>
                  <span className="text-black">x402 (HTTP 402)</span>
                </div>
                <div className="flex justify-between">
                  <span>Settlement</span>
                  <span className="text-black">USDC on-chain</span>
                </div>
                <div className="flex justify-between">
                  <span>Networks</span>
                  <span className="text-black">
                    Base, Arbitrum, Linea, Polygon
                  </span>
                </div>
              </div>
            </div>

            {/* 03 */}
            <div id="authentication" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  03
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">
                Wallet-Based Authentication
              </h2>
              <p className="text-gray-500 font-light leading-relaxed mb-6">
                Access to the Service requires a compatible blockchain wallet.
                You are solely responsible for:
              </p>
              <div className="grid gap-3">
                {[
                  {
                    title: "Wallet Security",
                    desc: "Safeguarding your private keys and seed phrases",
                  },
                  {
                    title: "Transaction Integrity",
                    desc: "Verifying transaction details before signing",
                  },
                  {
                    title: "Account Recovery",
                    desc: "OpenGrant cannot recover lost wallets or reverse transactions",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="flex items-start gap-4 p-4 rounded-xl bg-gray-50/50 border border-gray-100"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-black mt-2 shrink-0" />
                    <div>
                      <span className="text-sm font-medium text-black">
                        {item.title}
                      </span>
                      <p className="text-sm text-gray-500 font-light mt-0.5">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 04 */}
            <div id="publishers" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  04
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">
                Publisher Responsibilities
              </h2>
              <p className="text-gray-500 font-light leading-relaxed">
                API publishers are responsible for the accuracy of their API
                descriptions, endpoint availability, and compliance with
                applicable laws. Publishers retain full ownership of their APIs
                and content. Publishing an API on OpenGrant does not transfer
                any intellectual property rights to the platform.
              </p>
            </div>

            {/* 05 */}
            <div id="consumers" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  05
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">
                Consumer Responsibilities
              </h2>
              <p className="text-gray-500 font-light leading-relaxed">
                API consumers are responsible for their use of purchased API
                access. Consumers must comply with rate limits and usage
                policies set by individual publishers. Automated usage by AI
                agents or bots must adhere to the same terms as human users.
              </p>
            </div>

            {/* 06 */}
            <div id="payments" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  06
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">Payments and Fees</h2>
              <p className="text-gray-500 font-light leading-relaxed mb-6">
                All payments are processed on-chain in USDC. Payments are final
                and non-refundable once confirmed on-chain.
              </p>
              <div className="p-6 rounded-xl bg-white border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
                <div className="grid sm:grid-cols-3 gap-6">
                  <div>
                    <span className="text-xs font-mono text-gray-400 uppercase tracking-widest block mb-2">
                      Currency
                    </span>
                    <span className="text-2xl font-mono font-medium tracking-tight">
                      USDC
                    </span>
                  </div>
                  <div className="sm:border-l sm:border-gray-100 sm:pl-6">
                    <span className="text-xs font-mono text-gray-400 uppercase tracking-widest block mb-2">
                      Platform Fee
                    </span>
                    <span className="text-2xl font-mono font-medium tracking-tight">
                      2.5%
                    </span>
                  </div>
                  <div className="sm:border-l sm:border-gray-100 sm:pl-6">
                    <span className="text-xs font-mono text-gray-400 uppercase tracking-widest block mb-2">
                      Refunds
                    </span>
                    <span className="text-sm text-gray-500 font-light">
                      Non-refundable once confirmed on-chain
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 07 */}
            <div id="liability" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  07
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">
                Limitation of Liability
              </h2>
              <div className="p-6 rounded-xl bg-gray-50/50 border border-gray-100">
                <p className="text-gray-500 font-light leading-relaxed">
                  The Service is provided &ldquo;as is&rdquo; without
                  warranties of any kind, express or implied. OpenGrant shall
                  not be liable for any indirect, incidental, special, or
                  consequential damages arising from use of the Service,
                  including but not limited to loss of profits, data, or
                  business opportunities.
                </p>
              </div>
            </div>

            {/* 08 */}
            <div id="modifications" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  08
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">Modifications</h2>
              <p className="text-gray-500 font-light leading-relaxed">
                We reserve the right to modify these Terms at any time.
                Material changes will be communicated through the platform.
                Continued use of the Service after changes constitutes
                acceptance of the modified Terms.
              </p>
            </div>

            {/* 09 */}
            <div id="contact" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  09
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">Contact</h2>
              <div className="p-6 rounded-xl bg-white border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
                <p className="text-gray-500 font-light leading-relaxed mb-4">
                  For questions about these Terms, please reach out through one
                  of the following channels:
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <a
                    href="https://github.com/qvkare/opengrant"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    Open an Issue
                  </a>
                  <a
                    href={`${APP_URL}/auth`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 text-sm font-medium rounded-lg hover:border-black transition-colors"
                  >
                    Sign In to Platform
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* ── Sidebar TOC ── */}
          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-6">
                On this page
              </p>
              <nav className="space-y-1">
                {tocItems.map((item, i) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="flex items-center gap-3 py-1.5 text-sm text-gray-400 hover:text-black transition-colors group"
                  >
                    <span className="text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{item.label}</span>
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}
