import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy - OpenGrant",
  description:
    "How OpenGrant collects, uses, and protects your information. Minimal data collection with wallet-based authentication.",
  openGraph: {
    title: "Privacy Policy - OpenGrant",
    description:
      "How OpenGrant collects, uses, and protects your information.",
    url: "https://opengrant.dev/privacy",
    siteName: "OpenGrant",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Privacy Policy - OpenGrant",
    description:
      "How OpenGrant collects, uses, and protects your information.",
  },
};

const tocItems = [
  { id: "information-we-collect", label: "Information We Collect" },
  { id: "how-we-use-information", label: "How We Use Information" },
  { id: "data-storage", label: "Data Storage" },
  { id: "no-personal-data", label: "No Personal Data" },
  { id: "third-party-services", label: "Third-Party Services" },
  { id: "data-retention", label: "Data Retention" },
  { id: "security", label: "Security" },
  { id: "contact", label: "Contact" },
];

export default function PrivacyPage() {
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
            <span className="text-black">Privacy Policy</span>
          </nav>

          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight mb-6">
            Privacy Policy
          </h1>
          <p className="text-lg text-gray-500 font-light max-w-xl mb-8">
            We believe in minimal data collection. OpenGrant is built on
            wallet-based authentication &mdash; no emails, no passwords, no
            personal data.
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
            <div id="information-we-collect" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  01
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">
                Information We Collect
              </h2>
              <p className="text-gray-500 font-light leading-relaxed mb-6">
                OpenGrant collects minimal information required to operate the
                platform:
              </p>
              <div className="grid gap-3">
                <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50/50 border border-gray-100">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.5" aria-hidden="true">
                      <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-black">
                      Wallet addresses
                    </span>
                    <p className="text-sm text-gray-500 font-light mt-0.5">
                      Used for authentication and payment processing
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50/50 border border-gray-100">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.5" aria-hidden="true">
                      <path d="M12 20V10M18 20V4M6 20v-4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-black">
                      API usage data
                    </span>
                    <p className="text-sm text-gray-500 font-light mt-0.5">
                      Request counts, timestamps, and endpoint information
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-4 p-4 rounded-xl bg-gray-50/50 border border-gray-100">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.5" aria-hidden="true">
                      <path d="M2 10h20M2 14h20M6 18V6M10 18V6M14 18V6M18 18V6" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-black">
                      Transaction records
                    </span>
                    <p className="text-sm text-gray-500 font-light mt-0.5">
                      On-chain payment details for billing and verification
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 02 */}
            <div id="how-we-use-information" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  02
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">
                How We Use Information
              </h2>
              <p className="text-gray-500 font-light leading-relaxed mb-6">
                Collected information is used exclusively for platform
                operations:
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  "Authenticate users and manage sessions",
                  "Process and verify payments",
                  "Provide analytics to API publishers",
                  "Maintain platform security and prevent abuse",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-3 p-3 rounded-lg text-sm text-gray-600 font-light"
                  >
                    <div className="w-1 h-1 rounded-full bg-black shrink-0" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* 03 */}
            <div id="data-storage" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  03
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">Data Storage</h2>
              <p className="text-gray-500 font-light leading-relaxed">
                We store data in secured PostgreSQL databases with encrypted
                connections. On-chain transaction data is publicly visible on
                the respective blockchain networks by design &mdash; this is a
                fundamental property of blockchain transparency.
              </p>
            </div>

            {/* 04 */}
            <div id="no-personal-data" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  04
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">
                No Personal Data Collection
              </h2>
              <div className="p-6 rounded-xl bg-gray-50/50 border border-gray-100">
                <p className="text-gray-500 font-light leading-relaxed">
                  OpenGrant does not collect personal identifying information
                  such as names, emails, or phone numbers. Authentication is
                  entirely wallet-based. Social login through Particle Network
                  is handled by their own{" "}
                  <a
                    href="https://particle.network/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-black underline decoration-gray-300 hover:decoration-black transition-colors"
                  >
                    privacy policy
                  </a>
                  .
                </p>
              </div>
            </div>

            {/* 05 */}
            <div id="third-party-services" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  05
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">
                Third-Party Services
              </h2>
              <p className="text-gray-500 font-light leading-relaxed mb-6">
                We integrate with the following third-party services, each
                governed by their own privacy policies:
              </p>
              <div className="grid gap-3">
                {[
                  {
                    name: "Particle Network",
                    desc: "Wallet connection and social login",
                  },
                  {
                    name: "Chainlink CRE",
                    desc: "Payment verification oracles",
                  },
                  {
                    name: "Blockchain RPCs",
                    desc: "On-chain transaction processing",
                  },
                ].map((service) => (
                  <div
                    key={service.name}
                    className="flex items-center justify-between p-4 rounded-xl bg-gray-50/50 border border-gray-100"
                  >
                    <span className="text-sm font-medium text-black">
                      {service.name}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">
                      {service.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 06 */}
            <div id="data-retention" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  06
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">Data Retention</h2>
              <p className="text-gray-500 font-light leading-relaxed">
                Usage records and transaction history are retained indefinitely
                for billing accuracy and dispute resolution. You may request
                deletion of non-essential data by contacting us through the
                channels listed below.
              </p>
            </div>

            {/* 07 */}
            <div id="security" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  07
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">Security</h2>
              <p className="text-gray-500 font-light leading-relaxed mb-6">
                We implement industry-standard security measures to protect your
                data:
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { label: "HTTPS", desc: "Encrypted connections" },
                  { label: "Rate Limiting", desc: "Abuse prevention" },
                  { label: "Input Validation", desc: "Injection protection" },
                  { label: "On-chain Verification", desc: "Smart contract logic" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-50/50 border border-gray-100"
                  >
                    <span className="text-xs font-mono text-black bg-white px-2 py-0.5 rounded border border-gray-200">
                      {item.label}
                    </span>
                    <span className="text-sm text-gray-500 font-light">
                      {item.desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 08 */}
            <div id="contact" className="scroll-mt-28">
              <div className="flex items-center gap-4 mb-6">
                <span className="text-xs font-mono text-gray-400 tracking-widest">
                  08
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <h2 className="text-xl font-medium mb-4">Contact</h2>
              <div className="p-6 rounded-xl bg-white border border-gray-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
                <p className="text-gray-500 font-light leading-relaxed mb-4">
                  For privacy-related inquiries, please open an issue on our
                  GitHub repository.
                </p>
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
