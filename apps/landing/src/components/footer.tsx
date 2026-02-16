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

export function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-100 py-20 px-6 text-sm">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row justify-between gap-16">
        <div className="space-y-6 lg:w-1/3">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="font-bold text-lg tracking-tight">
              OpenGrant
            </span>
          </div>
          <p className="text-gray-500 leading-relaxed font-light">
            The infrastructure for the programmable economy. Making open source
            sustainable, one request at a time. Built by developers, for
            developers.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-10 lg:w-2/3">
          <div className="space-y-4">
            <h4 className="font-semibold text-black">Product</h4>
            <ul className="space-y-3 text-gray-500">
              <li>
                <a
                  href="#features"
                  className="hover:text-black transition-colors"
                >
                  Features
                </a>
              </li>
              <li>
                <a
                  href={`${APP_URL}/explore`}
                  className="hover:text-black transition-colors"
                >
                  Explore APIs
                </a>
              </li>
              <li>
                <a
                  href={`${APP_URL}/fund`}
                  className="hover:text-black transition-colors"
                >
                  Fund Projects
                </a>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h4 className="font-semibold text-black">Developers</h4>
            <ul className="space-y-3 text-gray-500">
              <li>
                <a
                  href="https://docs.opengrant.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-black transition-colors"
                >
                  Documentation
                </a>
              </li>
              <li>
                <a
                  href="https://www.npmjs.com/package/@opengrant/sdk"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-black transition-colors"
                >
                  SDK
                </a>
              </li>
              <li>
                <a
                  href="https://docs.opengrant.dev/api-reference/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-black transition-colors"
                >
                  API Reference
                </a>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h4 className="font-semibold text-black">Company</h4>
            <ul className="space-y-3 text-gray-500">
              <li>
                <a href="/terms" className="hover:text-black transition-colors">
                  Terms of Service
                </a>
              </li>
              <li>
                <a
                  href="/privacy"
                  className="hover:text-black transition-colors"
                >
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>
          <div className="space-y-4">
            <h4 className="font-semibold text-black">Social</h4>
            <ul className="space-y-3 text-gray-500">
              <li>
                <a
                  href="https://x.com/opengrant"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-black transition-colors"
                >
                  Twitter
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/qvkare/opengrant"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-black transition-colors"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-20 pt-8 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center text-gray-400 gap-4">
        <p>&copy; {new Date().getFullYear()} OpenGrant. All rights reserved.</p>
        <div className="flex gap-6">
          <a href="/privacy" className="hover:text-black transition-colors">
            Privacy Policy
          </a>
          <a href="/terms" className="hover:text-black transition-colors">
            Terms of Service
          </a>
        </div>
      </div>
    </footer>
  );
}
