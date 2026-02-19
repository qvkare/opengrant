"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiAuth } from "@/hooks/useApiAuth";
import { useWallet } from "@/contexts/wallet-context";
import { useEscrow, type TxStatus } from "@/hooks/useEscrow";
import { analyzeStack, executeStackFunding } from "@/lib/api";

interface Dependency {
  name: string;
  owner: string;
  repo: string;
  githubId: number;
  repoHash: string;
  isDirect: boolean;
  stars?: number;
}

interface ScoredDep extends Dependency {
  score: number;
}

interface AnalysisResult {
  analysisId: string;
  dependencies: Dependency[];
  scores: ScoredDep[];
  unresolved: string[];
  totalDependencies: number;
  directDependencies: number;
}

function detectPackageManager(filename: string): "npm" | "cargo" | "go" | null {
  if (filename === "package.json") return "npm";
  if (filename === "Cargo.toml") return "cargo";
  if (filename === "go.mod") return "go";
  return null;
}

function formatUSDCAmount(amount: number): string {
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount.toFixed(2)}`;
}

function TxStatusBadge({ status }: { status: TxStatus }) {
  if (status === "idle") return null;
  const labels: Record<TxStatus, { text: string; className: string }> = {
    idle: { text: "", className: "" },
    approving: { text: "Approving USDC spend...", className: "bg-yellow-500/10 text-yellow-600" },
    sending: { text: "Sending batch transaction...", className: "bg-blue-500/10 text-blue-600" },
    confirming: { text: "Confirming on-chain...", className: "bg-blue-500/10 text-blue-600" },
    success: { text: "Funding complete!", className: "bg-green-500/10 text-green-600" },
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

export default function StackFundPage() {
  const { token, authenticate } = useApiAuth();
  const { isConnected, setOpen: openConnectModal } = useWallet();
  const escrow = useEscrow();

  const [fileContent, setFileContent] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [packageManager, setPackageManager] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [budget, setBudget] = useState("50");
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    handleFile(file);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      handleFile(file);
    },
    []
  );

  function handleFile(file: File) {
    const MAX_FILE_SIZE = 512 * 1024; // 512KB
    if (file.size > MAX_FILE_SIZE) {
      setError("File too large. Maximum size is 512KB.");
      return;
    }

    const pm = detectPackageManager(file.name);
    if (!pm) {
      setError(
        "Unsupported file. Please upload package.json, Cargo.toml, or go.mod"
      );
      return;
    }
    setPackageManager(pm);
    setFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      setFileContent(e.target?.result as string);
    };
    reader.readAsText(file);
  }

  async function handleAnalyze() {
    if (!fileContent || !packageManager) return;

    let apiToken = token;
    if (!apiToken) {
      apiToken = await authenticate();
      if (!apiToken) {
        setError("Failed to authenticate. Please connect your wallet.");
        return;
      }
    }

    setAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeStack(apiToken, {
        content: fileContent,
        packageManager,
      });
      setAnalysis(result);
    } catch (err: any) {
      setError(err.message || "Failed to analyze dependencies");
    } finally {
      setAnalyzing(false);
    }
  }

  const budgetNum = parseFloat(budget) || 0;
  const distributions =
    analysis?.scores
      .map((dep) => ({
        ...dep,
        amount: Math.floor(dep.score * budgetNum * 100) / 100,
      }))
      .filter((d) => d.amount >= 1 && d.repoHash)
      .sort((a, b) => b.amount - a.amount) || [];

  async function handleFundStack() {
    if (distributions.length === 0 || !analysis) return;

    if (!isConnected) {
      openConnectModal(true);
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

    escrow.reset();
    setError(null);

    try {
      const repoHashes = distributions.map(
        (d) => d.repoHash as `0x${string}`
      );
      const amounts = distributions.map((d) => d.amount.toFixed(2));
      const flags = distributions.map(() => false);

      // Execute batch donate on-chain
      const txHash = await escrow.batchDonate(repoHashes, amounts, flags);

      // Record in backend
      await executeStackFunding(apiToken, {
        analysisId: analysis.analysisId,
        txHash,
        chainId: escrow.chainId,
        budget: budgetNum.toString(),
      });
    } catch (err: any) {
      setError(err.shortMessage || err.message || "Transaction failed");
    }
  }

  const isBusy =
    escrow.txStatus !== "idle" &&
    escrow.txStatus !== "success" &&
    escrow.txStatus !== "error";

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
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
        <span>Stack Fund</span>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-3">Fund Your Stack</h1>
        <p className="text-muted-foreground max-w-xl mx-auto">
          Upload your dependency manifest to distribute funding across all the
          open source projects your application depends on.
        </p>
      </div>

      {/* Step 1: Upload */}
      {!analysis && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>1. Upload Dependency File</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              className="border-2 border-dashed rounded-lg p-8 text-center hover:border-black/30 transition-colors cursor-pointer"
              onClick={() =>
                document.getElementById("file-input")?.click()
              }
            >
              <svg
                className="mx-auto h-12 w-12 text-muted-foreground mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-sm font-medium mb-1">
                {fileName || "Drop your file here or click to browse"}
              </p>
              <p className="text-xs text-muted-foreground">
                Supports: package.json, Cargo.toml, go.mod
              </p>
              <input
                id="file-input"
                type="file"
                accept=".json,.toml,.mod"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {fileName && packageManager && (
              <div className="mt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{packageManager}</Badge>
                  <span className="text-sm">{fileName}</span>
                </div>
                <Button
                  onClick={handleAnalyze}
                  disabled={analyzing || !isConnected}
                >
                  {analyzing ? "Analyzing..." : "Analyze Dependencies"}
                </Button>
              </div>
            )}

            {!isConnected && fileName && (
              <p className="text-sm text-yellow-600 mt-2">
                Connect your wallet to analyze dependencies
              </p>
            )}

            {error && (
              <p className="text-sm text-red-500 mt-2">{error}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Review & Budget */}
      {analysis && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>2. Analysis Results</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">
                    {analysis.totalDependencies}
                  </p>
                  <p className="text-xs text-muted-foreground">Total Deps</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">
                    {analysis.dependencies.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Resolved</p>
                </div>
                <div className="text-center p-3 bg-muted rounded-lg">
                  <p className="text-2xl font-bold">
                    {analysis.unresolved.length}
                  </p>
                  <p className="text-xs text-muted-foreground">Unresolved</p>
                </div>
              </div>

              {analysis.unresolved.length > 0 && (
                <details className="text-sm text-muted-foreground">
                  <summary className="cursor-pointer hover:text-foreground">
                    {analysis.unresolved.length} unresolved packages
                  </summary>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {analysis.unresolved.map((pkg) => (
                      <Badge key={pkg} variant="outline" className="text-xs">
                        {pkg}
                      </Badge>
                    ))}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>3. Set Budget</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Label htmlFor="budget">Total Budget (USDC)</Label>
                <div className="flex gap-2">
                  {[25, 50, 100, 250, 500].map((amt) => (
                    <Button
                      key={amt}
                      variant={
                        budget === amt.toString() ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setBudget(amt.toString())}
                      disabled={isBusy}
                    >
                      ${amt}
                    </Button>
                  ))}
                </div>
                <Input
                  id="budget"
                  type="number"
                  min="1"
                  max="10000"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  disabled={isBusy}
                />
              </div>
            </CardContent>
          </Card>

          {/* Distribution Preview */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Distribution Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {distributions.length > 0 ? (
                <div className="space-y-2">
                  {distributions.map((dep) => (
                    <div
                      key={dep.repoHash}
                      className="flex items-center justify-between py-2 border-b last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {dep.owner}/{dep.repo}
                        </span>
                        {dep.isDirect && (
                          <Badge variant="secondary" className="text-xs">
                            direct
                          </Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <span className="font-medium text-green-500">
                          {formatUSDCAmount(dep.amount)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({(dep.score * 100).toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 font-medium">
                    <span>Total</span>
                    <span className="text-green-500">
                      {formatUSDCAmount(
                        distributions.reduce((sum, d) => sum + d.amount, 0)
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Budget too small to distribute. Increase your budget.
                </p>
              )}
            </CardContent>
          </Card>

          <TxStatusBadge status={escrow.txStatus} />

          {escrow.error && (
            <div className="p-3 bg-red-500/10 rounded-xl text-sm text-red-600 text-center mb-4">
              {escrow.error}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-500/10 rounded-xl text-sm text-red-600 text-center mb-4">
              {error}
            </div>
          )}

          {escrow.txHash && escrow.txStatus === "success" && (
            <div className="p-3 bg-green-500/10 rounded-xl text-sm text-center mb-4">
              <p className="font-medium text-green-600 mb-1">
                Successfully funded {distributions.length} projects!
              </p>
              <a
                href={`https://sepolia.basescan.org/tx/${escrow.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-green-600 underline text-xs"
              >
                View transaction on BaseScan
              </a>
            </div>
          )}

          <Button
            className="w-full"
            size="lg"
            disabled={distributions.length === 0 || isBusy || escrow.isWrongChain}
            onClick={handleFundStack}
          >
            {isBusy ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                Processing...
              </>
            ) : escrow.isWrongChain ? (
              `Switch to ${escrow.chainName}`
            ) : !isConnected ? (
              "Connect Wallet to Fund"
            ) : (
              `Fund ${distributions.length} Projects - $${distributions.reduce((sum, d) => sum + d.amount, 0).toFixed(2)} USDC`
            )}
          </Button>

          <div className="flex justify-center mt-4">
            <Button
              variant="ghost"
              disabled={isBusy}
              onClick={() => {
                setAnalysis(null);
                setFileContent(null);
                setFileName("");
                escrow.reset();
                setError(null);
              }}
            >
              Start Over
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
