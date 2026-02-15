"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useWallet } from "@/contexts/wallet-context";

interface ClaimableRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  totalFunded: string;
  donorCount: number;
  repoHash: string;
}

function formatUSDCAmount(amount: string): string {
  const num = parseFloat(amount);
  if (num > 0) return `$${num.toFixed(2)}`;
  return "$0";
}

export default function ClaimPage() {
  const { token } = useApiAuth();
  const { address, isConnected } = useWallet();
  const [githubToken, setGithubToken] = useState("");
  const [repos, setRepos] = useState<ClaimableRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleGithubLogin() {
    // In production, this would use GitHub OAuth flow
    // For now, show manual token input
    setError("GitHub OAuth integration requires GITHUB_CLIENT_ID to be configured. You can enter a GitHub Personal Access Token manually.");
  }

  async function handleFetchRepos() {
    if (!githubToken) {
      setError("Please enter a GitHub token");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Fetch user's repos from GitHub
      const res = await fetch("https://api.github.com/user/repos?type=owner&sort=stars&per_page=100", {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (!res.ok) {
        throw new Error("Invalid GitHub token");
      }

      const ghRepos = await res.json();
      // Filter to repos that might have escrow funds
      // In production, this would cross-reference with our DB
      setRepos(
        ghRepos.slice(0, 20).map((r: any) => ({
          id: r.id.toString(),
          owner: r.owner.login,
          name: r.name,
          fullName: r.full_name,
          totalFunded: "0", // Would come from our API
          donorCount: 0,
          repoHash: "",
        }))
      );
    } catch (err: any) {
      setError(err.message || "Failed to fetch repos");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/fund" className="hover:text-foreground">Fund</Link>
        <span>/</span>
        <span>Claim</span>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-3">Claim Funds</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          If your open source project has received donations through OpenGrant,
          verify your ownership to claim the funds.
        </p>
      </div>

      {/* Step 1: Connect Wallet */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-black text-white text-sm">1</span>
            Connect Wallet
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isConnected && address ? (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-xl">
              <Badge variant="default" className="bg-green-600">Connected</Badge>
              <span className="text-sm font-mono">
                {address.slice(0, 6)}...{address.slice(-4)}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Please connect your wallet using the header button to continue.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 2: GitHub Auth */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-black text-white text-sm">2</span>
            Verify GitHub Ownership
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter a GitHub Personal Access Token with <code className="px-1 py-0.5 bg-muted rounded text-xs">repo</code> scope
            to verify your repository ownership.
          </p>

          <div className="space-y-2">
            <Label htmlFor="github-token">GitHub Token</Label>
            <Input
              id="github-token"
              type="password"
              placeholder="ghp_..."
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
            />
          </div>

          <Button onClick={handleFetchRepos} disabled={loading || !githubToken}>
            {loading ? "Fetching..." : "Fetch My Repos"}
          </Button>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Select and Claim */}
      {repos.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-black text-white text-sm">3</span>
              Your Repositories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {repos.map((repo) => (
                <div key={repo.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-xl">
                  <div>
                    <p className="text-sm font-medium">{repo.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {parseFloat(repo.totalFunded) > 0
                        ? `${formatUSDCAmount(repo.totalFunded)} available`
                        : "No funds available"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={parseFloat(repo.totalFunded) <= 0 || claiming === repo.id}
                    variant={parseFloat(repo.totalFunded) > 0 ? "default" : "ghost"}
                  >
                    {claiming === repo.id ? "Claiming..." : "Claim"}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
          <p className="font-medium text-green-600">{success}</p>
        </div>
      )}

      {/* Alternative: FUNDING.yml */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alternative: FUNDING.yml</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            You can also verify ownership by adding a FUNDING.yml file to your repository:
          </p>
          <pre className="p-3 bg-muted rounded-xl text-xs overflow-x-auto">
            {`# .github/FUNDING.yml
opengrant: 0xYourWalletAddress`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
