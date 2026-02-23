"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAddress, formatNumber } from "@/lib/utils";
import { getFundedRepo, getRepoDonors, recordDonation } from "@/lib/api";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useWallet } from "@/contexts/wallet-context";
import { useEscrow, type TxStatus } from "@/hooks/useEscrow";

interface RepoDetail {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  avatarUrl: string | null;
  homepageUrl: string | null;
  license: string | null;
  topics: string[] | null;
  totalFunded: string;
  totalClaimed: string;
  donorCount: number;
  claimStatus: string;
  claimedBy: string | null;
  repoHash: string;
  onChain: {
    balance: string;
    totalDonated: string;
    totalClaimed: string;
    claimedWallet: string;
    donorCount: number;
  } | null;
  linkedApis?: {
    id: string;
    slug: string;
    name: string;
    totalCalls: number;
  }[];
}

interface Donor {
  donorWallet: string;
  amount: string;
  txHash: string;
  chainId: number;
  createdAt: string;
}

function formatUSDCAmount(amount: string): string {
  const num = parseFloat(amount);
  if (num > 0) return `$${num.toFixed(2)}`;
  return "$0";
}

function TxStatusBadge({ status }: { status: TxStatus }) {
  if (status === "idle") return null;
  const labels: Record<TxStatus, { text: string; className: string }> = {
    idle: { text: "", className: "" },
    approving: { text: "Approving USDC...", className: "bg-yellow-500/10 text-yellow-600" },
    sending: { text: "Sending transaction...", className: "bg-blue-500/10 text-blue-600" },
    confirming: { text: "Confirming on-chain...", className: "bg-blue-500/10 text-blue-600" },
    success: { text: "Transaction confirmed!", className: "bg-green-500/10 text-green-600" },
    error: { text: "Transaction failed", className: "bg-red-500/10 text-red-600" },
  };
  const label = labels[status];
  return (
    <div className={`p-3 rounded-xl text-sm text-center font-medium ${label.className}`}>
      {status !== "success" && status !== "error" && (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2 align-middle" />
      )}
      {label.text}
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const owner = params.owner as string;
  const name = params.name as string;

  const { token, authenticate } = useApiAuth();
  const { isConnected, setOpen: openConnectModal } = useWallet();
  const escrow = useEscrow();

  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [donors, setDonors] = useState<Donor[]>([]);
  const [loading, setLoading] = useState(true);
  const [donateAmount, setDonateAmount] = useState("10");
  const [redistributeOnTimeout, setRedistributeOnTimeout] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [repoData, donorData] = await Promise.all([
          getFundedRepo(owner, name),
          getRepoDonors(owner, name, { limit: 10 }),
        ]);
        setRepo(repoData);
        setDonors(donorData.data);
      } catch {
        // API unavailable
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [owner, name]);

  async function refreshData() {
    try {
      const [repoData, donorData] = await Promise.all([
        getFundedRepo(owner, name),
        getRepoDonors(owner, name, { limit: 10 }),
      ]);
      setRepo(repoData);
      setDonors(donorData.data);
    } catch {
      // ignore
    }
  }

  async function handleDonate() {
    const amount = parseFloat(donateAmount);
    if (!amount || amount < 1) return;

    if (!isConnected) {
      openConnectModal(true);
      return;
    }

    let apiToken = token;
    if (!apiToken) {
      apiToken = await authenticate();
      if (!apiToken) {
        escrow.setError("Failed to authenticate. Please try again.");
        return;
      }
    }

    if (!repo?.repoHash) {
      escrow.setError("Repository hash not available");
      return;
    }

    escrow.reset();

    try {
      const repoHash = repo.repoHash as `0x${string}`;
      const txHash = await escrow.donate(repoHash, donateAmount, redistributeOnTimeout);

      try {
        await recordDonation(apiToken, {
          repoId: repo.id,
          txHash,
          chainId: escrow.chainId,
          amount: donateAmount,
          redistributeOnTimeout,
          source: "direct",
        });
      } catch {
        // On-chain donation succeeded but backend recording failed.
      }

      await refreshData();
    } catch (err: unknown) {
      const e = err as { shortMessage?: string; message?: string };
      escrow.setError(e.shortMessage || e.message || "Transaction failed");
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
      </div>
    );
  }

  if (!repo) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Project Not Found</h1>
        <p className="text-muted-foreground mb-4">
          {owner}/{name} is not in our database yet.
        </p>
        <Link href="/fund">
          <Button>Back to Explore</Button>
        </Link>
      </div>
    );
  }

  const amountNum = parseFloat(donateAmount);
  const isValidAmount = amountNum >= 1 && amountNum <= 1_000_000;
  const isBusy = escrow.txStatus !== "idle" && escrow.txStatus !== "success" && escrow.txStatus !== "error";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Banners */}
      <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-center text-sm">
        <span className="font-medium text-yellow-700">Base Sepolia Testnet</span>
        <span className="text-yellow-600"> — Uses test USDC. No real funds involved.</span>
      </div>

      {isConnected && escrow.isWrongChain && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center text-sm">
          <span className="text-red-600">
            Wrong network detected. Please switch to <strong>{escrow.chainName}</strong> in your wallet.
          </span>
        </div>
      )}

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link href="/fund" className="hover:text-foreground">Fund</Link>
        <span>/</span>
        <span>{repo.fullName}</span>
      </div>

      {/* Project Header */}
      <div className="flex items-start gap-4 mb-8">
        {repo.avatarUrl && (
          <img src={repo.avatarUrl} alt={repo.owner} className="w-14 h-14 rounded-full flex-shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold truncate">{repo.fullName}</h1>
          {repo.description && (
            <p className="text-muted-foreground mt-1 line-clamp-2">{repo.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-3 mt-3">
            {repo.language && <Badge variant="secondary">{repo.language}</Badge>}
            {repo.license && <Badge variant="outline">{repo.license}</Badge>}
            <span className="flex items-center gap-1 text-sm">
              <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {formatNumber(repo.stars)}
            </span>
            <span className="text-sm text-muted-foreground">
              {formatNumber(repo.forks)} forks
            </span>
            {repo.homepageUrl && (
              <a
                href={repo.homepageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline truncate max-w-[180px]"
              >
                {repo.homepageUrl}
              </a>
            )}
          </div>
          {repo.topics && repo.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {repo.topics.slice(0, 8).map((topic) => (
                <span key={topic} className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                  {topic}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: stats + linked APIs + donors */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total Funded
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">
                  {formatUSDCAmount(repo.totalFunded)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Donors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{repo.donorCount}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge
                  variant={repo.claimStatus === "claimed" ? "default" : "secondary"}
                  className={repo.claimStatus === "claimed" ? "bg-green-600" : ""}
                >
                  {repo.claimStatus === "claimed" ? "Claimed" : "Unclaimed"}
                </Badge>
                {repo.claimedBy && (
                  <p className="text-xs text-muted-foreground mt-1">
                    by {formatAddress(repo.claimedBy)}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Linked APIs */}
          {repo.linkedApis && repo.linkedApis.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>OpenGrant APIs</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  APIs monetized through OpenGrant from this repo
                </p>
                <div className="space-y-2">
                  {repo.linkedApis.map((api) => (
                    <Link
                      key={api.id}
                      href={`/${api.slug}`}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    >
                      <div>
                        <p className="font-medium">{api.name}</p>
                        <p className="text-xs text-muted-foreground">/{api.slug}</p>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {formatNumber(api.totalCalls)} calls
                      </span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Donors */}
          {donors.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Donors</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {donors.map((donor) => (
                    <div
                      key={donor.txHash}
                      className="flex items-center justify-between py-2 border-b last:border-b-0"
                    >
                      <div>
                        <p className="text-sm font-medium">{formatAddress(donor.donorWallet)}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(donor.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="font-medium text-green-600">
                        {formatUSDCAmount(donor.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right column: donate form (sticky) */}
        <div className="lg:sticky lg:top-24 h-fit">
          <Card>
            <CardHeader>
              <CardTitle>Fund This Project</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {repo.claimStatus === "claimed" && repo.claimedBy && (
                <div className="p-3 bg-green-500/10 rounded-xl text-sm">
                  Funds go directly to {formatAddress(repo.claimedBy)}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="amount">Amount (USDC)</Label>
                <div className="flex flex-wrap gap-2">
                  {[5, 10, 25, 50, 100].map((amt) => (
                    <Button
                      key={amt}
                      variant={donateAmount === amt.toString() ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDonateAmount(amt.toString())}
                      disabled={isBusy}
                    >
                      ${amt}
                    </Button>
                  ))}
                </div>
                <Input
                  id="amount"
                  type="number"
                  min="1"
                  step="0.01"
                  value={donateAmount}
                  onChange={(e) => setDonateAmount(e.target.value)}
                  placeholder="Custom amount"
                  disabled={isBusy}
                />
              </div>

              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="redistribute"
                  checked={redistributeOnTimeout}
                  onChange={(e) => setRedistributeOnTimeout(e.target.checked)}
                  className="rounded mt-0.5"
                  disabled={isBusy}
                />
                <Label htmlFor="redistribute" className="text-sm font-normal leading-snug">
                  If unclaimed after 1 year, allow redistribution to other projects
                </Label>
              </div>

              <TxStatusBadge status={escrow.txStatus} />

              {escrow.error && (
                <div className="p-3 bg-red-500/10 rounded-xl text-sm text-red-600 text-center">
                  {escrow.error}
                </div>
              )}

              {escrow.txHash && escrow.txStatus === "success" && (
                <div className="p-3 bg-green-500/10 rounded-xl text-sm text-center">
                  <a
                    href={`https://sepolia.basescan.org/tx/${escrow.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-600 underline"
                  >
                    View on BaseScan
                  </a>
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                disabled={!donateAmount || !isValidAmount || isBusy || escrow.isWrongChain}
                onClick={handleDonate}
              >
                {isBusy ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Processing...
                  </>
                ) : escrow.isWrongChain ? (
                  `Switch to ${escrow.chainName}`
                ) : !isConnected ? (
                  "Connect Wallet to Donate"
                ) : (
                  `Donate $${donateAmount} USDC`
                )}
              </Button>

              {donateAmount && parseFloat(donateAmount) < 1 && (
                <p className="text-xs text-red-500 text-center">Minimum donation is 1 USDC</p>
              )}

              <p className="text-xs text-muted-foreground text-center">
                Trustless on-chain escrow. 0% platform fee.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
