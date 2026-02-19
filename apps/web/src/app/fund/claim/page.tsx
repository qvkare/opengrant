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
import { useEscrow, type TxStatus } from "@/hooks/useEscrow";
import {
  listFundedRepos,
  getClaimAuthorization,
  confirmClaim,
} from "@/lib/api";

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

function TxStatusInline({ status }: { status: TxStatus }) {
  if (status === "idle" || status === "success") return null;
  const labels: Record<string, string> = {
    approving: "Approving...",
    sending: "Sending...",
    confirming: "Confirming...",
    error: "Failed",
  };
  return (
    <span className="text-xs text-muted-foreground ml-2">
      {status !== "error" && (
        <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin mr-1 align-middle" />
      )}
      {labels[status]}
    </span>
  );
}

export default function ClaimPage() {
  const { token, authenticate } = useApiAuth();
  const { address, isConnected } = useWallet();
  const escrow = useEscrow();
  const [githubToken, setGithubToken] = useState("");
  const [repos, setRepos] = useState<ClaimableRepo[]>([]);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleFetchRepos() {
    if (!githubToken) {
      setError("Please enter a GitHub token");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Fetch user's repos from GitHub to get list of owned repos
      const ghRes = await fetch(
        "https://api.github.com/user/repos?type=owner&sort=stars&per_page=100",
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            Accept: "application/vnd.github+json",
          },
        }
      );

      if (!ghRes.ok) {
        throw new Error("Invalid GitHub token");
      }

      const ghRepos = await ghRes.json();
      const ownerRepoNames = new Set(
        ghRepos.map((r: any) => `${r.owner.login}/${r.name}`.toLowerCase())
      );

      // Fetch funded repos from backend (paginate to get all)
      const fundedRepos: any[] = [];
      let offset = 0;
      const pageSize = 100;
      while (true) {
        const page = await listFundedRepos({ limit: pageSize, offset });
        fundedRepos.push(...(page.data as any[]));
        if (page.data.length < pageSize) break;
        offset += pageSize;
      }

      // Cross-reference: only show repos the user owns AND that have funds
      const claimable: ClaimableRepo[] = fundedRepos
        .filter(
          (repo: any) =>
            ownerRepoNames.has(`${repo.owner}/${repo.name}`.toLowerCase()) &&
            parseFloat(repo.totalFunded || "0") > 0 &&
            repo.claimStatus !== "claimed" &&
            repo.claimStatus !== "opted_out"
        )
        .map((repo: any) => ({
          id: repo.id,
          owner: repo.owner,
          name: repo.name,
          fullName: repo.fullName || `${repo.owner}/${repo.name}`,
          totalFunded: repo.totalFunded || "0",
          donorCount: repo.donorCount || 0,
          repoHash: repo.repoHash || "",
        }));

      setRepos(claimable);

      if (claimable.length === 0) {
        setError(
          "No claimable repos found. Either your repos have no funds or they have already been claimed."
        );
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch repos");
    } finally {
      setLoading(false);
    }
  }

  async function handleClaim(repo: ClaimableRepo) {
    if (!address || !isConnected) {
      setError("Please connect your wallet first");
      return;
    }

    if (!repo.repoHash) {
      setError("Repository hash not available for claiming");
      return;
    }

    let apiToken = token;
    if (!apiToken) {
      apiToken = await authenticate();
      if (!apiToken) {
        setError("Failed to authenticate. Please try again.");
        return;
      }
    }

    setClaiming(repo.id);
    setError(null);
    setSuccess(null);
    escrow.reset();

    try {
      // Step 1: Get claim authorization from backend
      const auth = await getClaimAuthorization(
        apiToken,
        { repoId: repo.id, walletAddress: address },
        githubToken
      );

      // Step 2: Execute on-chain claim
      const txHash = await escrow.claim(
        auth.repoHash as `0x${string}`,
        address as `0x${string}`,
        BigInt(auth.nonce),
        auth.signature as `0x${string}`
      );

      // Step 3: Confirm claim in backend
      await confirmClaim(apiToken, {
        repoId: repo.id,
        txHash,
      });

      setSuccess(
        `Successfully claimed funds for ${repo.fullName}! Tx: ${txHash.slice(0, 10)}...`
      );

      // Remove claimed repo from list
      setRepos((prev) => prev.filter((r) => r.id !== repo.id));
    } catch (err: any) {
      setError(err.shortMessage || err.message || "Claim failed");
    } finally {
      setClaiming(null);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Testnet Banner */}
      <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-center text-sm">
        <span className="font-medium text-yellow-700">Base Sepolia Testnet</span>
        <span className="text-yellow-600"> — Uses test USDC. No real funds involved.</span>
      </div>

      {/* Wrong Chain Warning */}
      {isConnected && escrow.isWrongChain && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-sm">
          <span className="text-red-600">
            Wrong network detected. Please switch to <strong>{escrow.chainName}</strong> in your wallet.
          </span>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/fund" className="hover:text-foreground">
          Fund
        </Link>
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
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-black text-white text-sm">
              1
            </span>
            Connect Wallet
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isConnected && address ? (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-xl">
              <Badge variant="default" className="bg-green-600">
                Connected
              </Badge>
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
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-black text-white text-sm">
              2
            </span>
            Verify GitHub Ownership
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enter a GitHub Personal Access Token with{" "}
            <code className="px-1 py-0.5 bg-muted rounded text-xs">repo</code>{" "}
            scope to verify your repository ownership.
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

          <Button
            onClick={handleFetchRepos}
            disabled={loading || !githubToken || !isConnected}
          >
            {loading ? "Fetching..." : "Find Claimable Repos"}
          </Button>

          {!isConnected && githubToken && (
            <p className="text-sm text-yellow-600">
              Connect your wallet first (Step 1)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Select and Claim */}
      {repos.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-black text-white text-sm">
                3
              </span>
              Claimable Repositories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {repos.map((repo) => (
                <div
                  key={repo.id}
                  className="flex items-center justify-between p-3 border border-gray-100 rounded-xl"
                >
                  <div>
                    <p className="text-sm font-medium">{repo.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatUSDCAmount(repo.totalFunded)} from{" "}
                      {repo.donorCount} donor{repo.donorCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <Button
                      size="sm"
                      disabled={claiming !== null || escrow.isWrongChain}
                      onClick={() => handleClaim(repo)}
                    >
                      {escrow.isWrongChain
                        ? `Switch to ${escrow.chainName}`
                        : claiming === repo.id
                          ? "Claiming..."
                          : "Claim"}
                    </Button>
                    {claiming === repo.id && (
                      <TxStatusInline status={escrow.txStatus} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-center mb-6">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-center mb-6">
          <p className="font-medium text-green-600">{success}</p>
          {escrow.txHash && (
            <a
              href={`https://sepolia.basescan.org/tx/${escrow.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-600 underline mt-1 inline-block"
            >
              View on BaseScan
            </a>
          )}
        </div>
      )}

      {/* Alternative: FUNDING.yml */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Alternative: FUNDING.yml</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            You can also verify ownership by adding a FUNDING.yml file to your
            repository:
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
