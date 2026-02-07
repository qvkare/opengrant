"use client";

import Link from "next/link";
import { useModal } from "@particle-network/connectkit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Zap, Shield, Code, DollarSign, Users, TrendingUp } from "lucide-react";

export default function HomePage() {
  const { setOpen } = useModal();

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-32">
        <div className="container relative z-10">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-6 inline-flex items-center rounded-full border bg-muted px-4 py-1.5 text-sm">
              <span className="mr-2">Powered by x402 + Chainlink CRE</span>
              <ArrowRight className="h-4 w-4" />
            </div>
            <h1 className="mb-6 text-4xl font-bold tracking-tight md:text-6xl lg:text-7xl">
              Monetize Your{" "}
              <span className="bg-gradient-to-r from-blue-500 to-purple-600 bg-clip-text text-transparent">
                Open Source APIs
              </span>
            </h1>
            <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground md:text-xl">
              Transform free APIs into revenue streams with HTTP-native micropayments.
              AI agents pay per call. No subscriptions. No friction.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Button size="lg" onClick={() => setOpen(true)} className="gap-2">
                Start Earning <ArrowRight className="h-4 w-4" />
              </Button>
              <Link href="/explore">
                <Button size="lg" variant="outline">
                  Explore APIs
                </Button>
              </Link>
            </div>
          </div>
        </div>
        {/* Background gradient */}
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_60%,rgba(59,130,246,0.1),transparent)]" />
      </section>

      {/* Stats Section */}
      <section className="border-y bg-muted/50 py-12">
        <div className="container">
          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">$0.001</div>
              <div className="text-sm text-muted-foreground">Minimum Payment</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">2s</div>
              <div className="text-sm text-muted-foreground">Settlement Time</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-primary">2.5%</div>
              <div className="text-sm text-muted-foreground">Platform Fee</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="container">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              Why Open Source Projects Choose Us
            </h2>
            <p className="text-muted-foreground">
              Stop relying on donations. Start capturing value proportional to usage.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <Zap className="mb-2 h-10 w-10 text-primary" />
                <CardTitle>HTTP-Native Payments</CardTitle>
                <CardDescription>
                  x402 protocol enables instant micropayments within HTTP requests.
                  No accounts needed. Just wallet + API call.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <Shield className="mb-2 h-10 w-10 text-primary" />
                <CardTitle>Verified by Chainlink</CardTitle>
                <CardDescription>
                  Payment verification through decentralized oracle networks.
                  Multi-node consensus ensures every transaction is valid.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <Code className="mb-2 h-10 w-10 text-primary" />
                <CardTitle>5-Minute Integration</CardTitle>
                <CardDescription>
                  Add payment gating to any API with a single middleware.
                  No major code changes required.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <DollarSign className="mb-2 h-10 w-10 text-primary" />
                <CardTitle>AI Agent Ready</CardTitle>
                <CardDescription>
                  AI agents can autonomously discover, evaluate, and pay for APIs.
                  Capture the $8B+ agent spending market.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <Users className="mb-2 h-10 w-10 text-primary" />
                <CardTitle>Revenue Splitting</CardTitle>
                <CardDescription>
                  Configure automatic revenue distribution to team members,
                  contributors, or an OSS fund with smart contract vaults.
                </CardDescription>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <TrendingUp className="mb-2 h-10 w-10 text-primary" />
                <CardTitle>Real-Time Analytics</CardTitle>
                <CardDescription>
                  Track API usage, revenue, and consumer behavior.
                  Make data-driven pricing decisions.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="border-t bg-muted/30 py-20">
        <div className="container">
          <div className="mx-auto mb-16 max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-bold md:text-4xl">
              How It Works
            </h2>
          </div>
          <div className="mx-auto max-w-4xl">
            <div className="grid gap-8 md:grid-cols-3">
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold">
                  1
                </div>
                <h3 className="mb-2 text-lg font-semibold">Register Your API</h3>
                <p className="text-sm text-muted-foreground">
                  Connect wallet, add your API endpoints, and set prices per call.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold">
                  2
                </div>
                <h3 className="mb-2 text-lg font-semibold">Consumers Pay Per Call</h3>
                <p className="text-sm text-muted-foreground">
                  AI agents and developers pay USDC for each API request automatically.
                </p>
              </div>
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold">
                  3
                </div>
                <h3 className="mb-2 text-lg font-semibold">Get Paid Instantly</h3>
                <p className="text-sm text-muted-foreground">
                  Revenue flows to your vault in real-time. Withdraw anytime.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container">
          <Card className="mx-auto max-w-3xl bg-gradient-to-br from-blue-500/10 to-purple-500/10">
            <CardContent className="p-8 text-center md:p-12">
              <h2 className="mb-4 text-2xl font-bold md:text-3xl">
                Ready to Monetize Your Open Source?
              </h2>
              <p className="mb-6 text-muted-foreground">
                Join projects like Tailwind CSS in capturing the value you create.
                Start earning from AI agents and developers today.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
                <Button size="lg" onClick={() => setOpen(true)}>
                  Become a Publisher
                </Button>
                <Link href="/tailwind">
                  <Button size="lg" variant="outline">
                    See Example Project
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
