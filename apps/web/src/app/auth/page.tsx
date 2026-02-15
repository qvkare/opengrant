"use client";

import { Suspense, useEffect, useState } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Wallet, CheckCircle2 } from "lucide-react";

function AuthContent() {
  const { isConnected, status, setOpen } = useWallet();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams.get("returnTo") || "/";
  // Prevent open redirect: only allow relative paths starting with /
  const returnTo = rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//") ? rawReturnTo : "/";
  const [isRedirecting, setIsRedirecting] = useState(false);

  const ready = status !== "connecting";

  useEffect(() => {
    if (ready && isConnected && !isRedirecting) {
      setIsRedirecting(true);
      // Small delay to show success state
      setTimeout(() => {
        router.push(returnTo);
      }, 500);
    }
  }, [ready, isConnected, router, returnTo, isRedirecting]);

  if (!ready) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (isConnected && isRedirecting) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 pt-6">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div className="text-center">
              <h2 className="text-lg font-semibold">Successfully Connected</h2>
              <p className="text-sm text-muted-foreground">
                Redirecting you to your destination...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Connect to OpenGrant</CardTitle>
          <CardDescription>
            Sign in with your wallet or social account to access the platform.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            className="w-full"
            size="lg"
            onClick={() => setOpen(true)}
          >
            <Wallet className="mr-2 h-5 w-5" />
            Connect Wallet
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            By connecting, you agree to our{" "}
            <a
              href="https://opengrant.dev/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Terms of Service
            </a>{" "}
            and{" "}
            <a
              href="https://opengrant.dev/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Privacy Policy
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[80vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      }
    >
      <AuthContent />
    </Suspense>
  );
}
