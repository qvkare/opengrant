"use client";

import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { useAccount, useModal } from "@particle-network/connectkit";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatUSDC } from "@/lib/utils";
import { getApiBySlug } from "@/lib/api";
import { useApiAuth } from "@/hooks/useApiAuth";
import {
  Heart,
  Coffee,
  Zap,
  ExternalLink,
  Copy,
  Check,
  Loader2,
} from "lucide-react";

interface ProjectData {
  slug: string;
  name: string;
  description: string;
  logoUrl: string | null;
  category: string | null;
  totalCalls: number;
  totalRevenue: string;
  endpoints: {
    path: string;
    method: string;
    description: string;
    pricePerCall: number;
  }[];
}

const supportTiers = [
  { id: "coffee", label: "Buy a Coffee", amount: 5, icon: Coffee },
  { id: "supporter", label: "Supporter", amount: 25, icon: Heart },
  { id: "sponsor", label: "Sponsor", amount: 100, icon: Zap },
];

export default function ProjectSupportPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { address, isConnected } = useAccount();
  const { setOpen } = useModal();
  const { token } = useApiAuth("consumer");

  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [supporting, setSupporting] = useState(false);

  useEffect(() => {
    async function fetchProject() {
      try {
        const data = await getApiBySlug(slug);
        setProject(data);
      } catch {
        // API unavailable
      } finally {
        setLoading(false);
      }
    }
    fetchProject();
  }, [slug]);

  const handleSupport = async (amount: number) => {
    if (!isConnected) {
      setOpen(true);
      return;
    }
    if (!token || !address || !project) return;

    setSupporting(true);
    try {
      // Initiate USDC transfer via the proxy endpoint
      // The SDK handles the x402 payment flow automatically
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || ""}/proxy/${project.slug}/support`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ amount }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Payment failed");
      }
    } catch (err) {
      console.error("Support error:", err);
    } finally {
      setSupporting(false);
    }
  };

  const copyBadge = () => {
    const badgeMarkdown = `[![Support on OpenGrant](https://opengrant.dev/badge/${slug}.svg)](https://opengrant.dev/${slug})`;
    navigator.clipboard.writeText(badgeMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold">API not found</h2>
          <p className="text-muted-foreground">The requested API does not exist or is not active.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-8">
      {/* Project Header */}
      <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-xl border bg-muted">
            {project.logoUrl ? (
              <img
                src={project.logoUrl}
                alt={project.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-muted-foreground">
                {project.name.charAt(0)}
              </div>
            )}
          </div>
          <div>
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <p className="mt-1 text-muted-foreground">{project.description}</p>
            {project.category && (
              <div className="mt-3">
                <span className="rounded bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                  {project.category}
                </span>
              </div>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={copyBadge} className="gap-2">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy Badge"}
        </Button>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-8">
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">
                  {formatNumber(project.totalCalls)}
                </div>
                <div className="text-sm text-muted-foreground">Total API Calls</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-green-500">
                  {formatUSDC(project.totalRevenue)}
                </div>
                <div className="text-sm text-muted-foreground">Total Revenue</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-2xl font-bold">
                  {project.endpoints.length}
                </div>
                <div className="text-sm text-muted-foreground">Endpoints</div>
              </CardContent>
            </Card>
          </div>

          {/* Available APIs */}
          <Card>
            <CardHeader>
              <CardTitle>Available APIs</CardTitle>
              <CardDescription>
                Pay-per-call API endpoints powered by x402
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {project.endpoints.map((endpoint, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg border p-4"
                  >
                    <div className="flex items-center gap-3">
                      <span className="rounded bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                        {endpoint.method}
                      </span>
                      <div>
                        <div className="font-mono text-sm">{endpoint.path}</div>
                        <div className="text-sm text-muted-foreground">
                          {endpoint.description}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">
                        ${(endpoint.pricePerCall / 1_000_000).toFixed(3)}
                      </div>
                      <div className="text-xs text-muted-foreground">per call</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button variant="outline" className="w-full gap-2">
                  View API Documentation <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Category */}
          {project.category && (
            <Card>
              <CardContent className="p-4">
                <span className="text-sm text-muted-foreground">Category: </span>
                <span className="rounded bg-primary/10 px-2 py-1 text-sm font-medium text-primary">
                  {project.category}
                </span>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar - Support Options */}
        <div className="space-y-6">
          <Card className="sticky top-24">
            <CardHeader>
              <CardTitle>Support {project.name}</CardTitle>
              <CardDescription>
                Help sustain open source development
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tier Options */}
              <div className="space-y-2">
                {supportTiers.map((tier) => {
                  const Icon = tier.icon;
                  return (
                    <button
                      key={tier.id}
                      onClick={() => {
                        setSelectedTier(tier.id);
                        setCustomAmount("");
                      }}
                      className={`w-full flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted ${
                        selectedTier === tier.id ? "border-primary bg-primary/5" : ""
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-primary" />
                        <span className="font-medium">{tier.label}</span>
                      </div>
                      <span className="font-semibold">${tier.amount}</span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Amount */}
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Or enter custom amount
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={customAmount}
                    onChange={(e) => {
                      setCustomAmount(e.target.value);
                      setSelectedTier(null);
                    }}
                    className="w-full rounded-lg border bg-background py-3 pl-7 pr-4 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Support Button */}
              <Button
                className="w-full"
                size="lg"
                onClick={() => {
                  const amount = customAmount
                    ? parseFloat(customAmount)
                    : supportTiers.find((t) => t.id === selectedTier)?.amount || 0;
                  if (amount > 0) {
                    handleSupport(amount);
                  }
                }}
                disabled={(!selectedTier && !customAmount) || supporting}
              >
                {supporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Heart className="mr-2 h-4 w-4" />
                )}
                {supporting
                  ? "Processing..."
                  : isConnected
                    ? "Support Now"
                    : "Connect Wallet to Support"}
              </Button>

              <p className="text-center text-xs text-muted-foreground">
                Payments are processed via USDC on Base network.
                <br />
                97.5% goes directly to the project.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
