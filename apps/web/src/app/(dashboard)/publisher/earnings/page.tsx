"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUSDC, formatAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useApiAuth } from "@/hooks/useApiAuth";
import { getPublisherEarnings, requestWithdrawal } from "@/lib/api";

const defaultEarnings = {
  availableBalance: "0",
  pendingBalance: "0",
  lifetimeEarnings: "0",
  platformFeesPaid: "0",
  withdrawals: [] as {
    id: string;
    amount: string;
    txHash: string;
    status: string;
    timestamp: string;
  }[],
  recentPayments: [] as {
    api: string;
    amount: string;
    from: string;
    time: string;
  }[],
};

function WithdrawModal({
  isOpen,
  onClose,
  availableBalance,
  token,
  onWithdrawn,
}: {
  isOpen: boolean;
  onClose: () => void;
  availableBalance: string;
  token: string | null;
  onWithdrawn: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleWithdraw = async () => {
    if (!token) return;
    setIsWithdrawing(true);
    setError(null);
    try {
      await requestWithdrawal(token, { amount });
      onWithdrawn();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setIsWithdrawing(false);
    }
  };

  const maxAmount = parseFloat(availableBalance) / 1_000_000;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Withdraw Earnings</CardTitle>
          <CardDescription>
            Withdraw your available USDC to your wallet
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Amount (USDC)</label>
            <div className="relative mt-1">
              <input
                type="number"
                step="0.01"
                min="0"
                max={maxAmount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <Button
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1"
                onClick={() => setAmount(maxAmount.toString())}
              >
                Max
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Available: {formatUSDC(availableBalance)}
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Network</span>
              <span>Base</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-muted-foreground">Estimated Gas</span>
              <span>~$0.01</span>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleWithdraw}
              disabled={!amount || parseFloat(amount) <= 0 || parseFloat(amount) > maxAmount || isWithdrawing || !token}
              className="flex-1"
            >
              {isWithdrawing ? "Withdrawing..." : "Withdraw"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PublisherEarningsPage() {
  const { token } = useApiAuth("publisher");
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [earnings, setEarnings] = useState(defaultEarnings);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchEarnings = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPublisherEarnings(token);
      setEarnings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load earnings");
    }
    setIsLoading(false);
  }, [token]);

  useEffect(() => {
    fetchEarnings();
  }, [fetchEarnings]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Earnings</h1>
          <p className="text-muted-foreground">
            Track your earnings and withdraw funds
          </p>
        </div>
        <Button onClick={() => setShowWithdrawModal(true)}>
          <svg
            className="w-4 h-4 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          Withdraw
        </Button>
      </div>

      {/* Balance Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-green-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Available to Withdraw
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">
              {formatUSDC(earnings.availableBalance)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Ready for withdrawal
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Settlement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatUSDC(earnings.pendingBalance)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Settles in ~5 minutes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Lifetime Earnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatUSDC(earnings.lifetimeEarnings)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Total earned all time
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Platform Fees Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {formatUSDC(earnings.platformFeesPaid)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">2.5% of earnings</p>
          </CardContent>
        </Card>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Payments */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Payments</CardTitle>
            <CardDescription>Latest payments received</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading payments...</p>
              ) : earnings.recentPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payments yet</p>
              ) : (
                earnings.recentPayments.map((payment, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="font-medium">{payment.api}</p>
                      <p className="text-xs text-muted-foreground">
                        from {payment.from} &middot; {payment.time}
                      </p>
                    </div>
                    <p className="font-semibold text-green-500">
                      +{formatUSDC(payment.amount)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Withdrawal History */}
        <Card>
          <CardHeader>
            <CardTitle>Withdrawal History</CardTitle>
            <CardDescription>Your past withdrawals</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Loading withdrawals...
              </p>
            ) : earnings.withdrawals.length > 0 ? (
              <div className="space-y-4">
                {earnings.withdrawals.map((withdrawal) => (
                  <div
                    key={withdrawal.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <p className="font-medium">
                        {formatUSDC(withdrawal.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(withdrawal.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                          withdrawal.status === "completed"
                            ? "bg-green-500/10 text-green-500"
                            : withdrawal.status === "pending"
                              ? "bg-yellow-500/10 text-yellow-500"
                              : "bg-red-500/10 text-red-500"
                        )}
                      >
                        {withdrawal.status}
                      </span>
                      <a
                        href={`https://basescan.org/tx/${withdrawal.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-muted-foreground hover:text-foreground mt-1"
                      >
                        {formatAddress(withdrawal.txHash)}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">
                No withdrawals yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <svg
                className="w-6 h-6 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h4 className="font-medium">How Settlements Work</h4>
              <p className="text-sm text-muted-foreground mt-1">
                API payments are processed via x402 micropayments and settled to
                your vault every 5 minutes via Chainlink CRE workflows. Funds become
                available for withdrawal after settlement is confirmed on-chain.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Withdraw Modal */}
      <WithdrawModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        availableBalance={earnings.availableBalance}
        token={token}
        onWithdrawn={fetchEarnings}
      />
    </div>
  );
}
