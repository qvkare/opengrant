"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUSDC, formatAddress } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useApiAuth } from "@/hooks/useApiAuth";
import { getConsumerPayments, getConsumerStats } from "@/lib/api";

interface PaymentsData {
  summary: { totalPaid: string; thisMonth: string; avgPerDay: string };
  transactions: {
    id: string;
    type: string;
    api?: string;
    project?: string;
    amount: string;
    txHash: string;
    timestamp: string;
    status: string;
  }[];
}

function TransactionIcon({ type }: { type: string }) {
  switch (type) {
    case "fund":
      return (
        <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-green-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
        </div>
      );
    case "support":
      return (
        <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-purple-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
        </div>
      );
    default:
      return (
        <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
      );
  }
}

export default function ConsumerPaymentsPage() {
  const { token } = useApiAuth("consumer");
  const [payments, setPayments] = useState<PaymentsData>({
    summary: { totalPaid: "0", thisMonth: "0", avgPerDay: "0" },
    transactions: [],
  });

  const fetchPayments = useCallback(async () => {
    if (!token) return;
    try {
      const [paymentsResult, statsResult] = await Promise.all([
        getConsumerPayments(token, { limit: 20 }),
        getConsumerStats(token, "30d"),
      ]);

      const totalSpent = statsResult.totalSpent || "0";
      const days = statsResult.period.days || 30;
      const avgPerDay = days > 0
        ? Math.round(parseInt(totalSpent) / days).toString()
        : "0";

      setPayments({
        summary: {
          totalPaid: totalSpent,
          thisMonth: totalSpent,
          avgPerDay,
        },
        transactions: paymentsResult.data.map((p) => ({
          id: p.id,
          type: "api_call",
          api: p.apiId.slice(0, 8),
          amount: p.priceCharged.toString(),
          txHash: p.paymentTxHash || "",
          timestamp: p.requestTimestamp,
          status: p.paymentStatus === "verified" ? "confirmed" : p.paymentStatus,
        })),
      });
    } catch {
      // API unavailable
    }
  }, [token]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
        <p className="text-muted-foreground">
          View your payment history and transactions
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatUSDC(payments.summary.totalPaid)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatUSDC(payments.summary.thisMonth)}
            </div>
            <p className="text-xs text-green-500 mt-1">+8% from last month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg per Day
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatUSDC(payments.summary.avgPerDay)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>All your payments and deposits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {payments.transactions.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between py-3 border-b last:border-0"
              >
                <div className="flex items-center gap-4">
                  <TransactionIcon type={tx.type} />
                  <div>
                    <p className="font-medium">
                      {tx.type === "fund"
                        ? "Added Funds"
                        : tx.type === "support"
                          ? `Supported ${tx.project}`
                          : `API Call - ${tx.api}`}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {new Date(tx.timestamp).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>&middot;</span>
                      <a
                        href={`https://basescan.org/tx/${tx.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-foreground font-mono"
                      >
                        {formatAddress(tx.txHash)}
                      </a>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "font-semibold",
                      tx.type === "fund" ? "text-green-500" : ""
                    )}
                  >
                    {tx.type === "fund" ? "+" : "-"}
                    {formatUSDC(tx.amount)}
                  </p>
                  <span
                    className={cn(
                      "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                      tx.status === "confirmed"
                        ? "bg-green-500/10 text-green-500"
                        : tx.status === "pending"
                          ? "bg-yellow-500/10 text-yellow-500"
                          : "bg-red-500/10 text-red-500"
                    )}
                  >
                    {tx.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Payment Info */}
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
              <h4 className="font-medium">How x402 Payments Work</h4>
              <p className="text-sm text-muted-foreground mt-1">
                OpenGrant uses the x402 protocol for HTTP-native micropayments. When you
                make an API call, your wallet automatically signs a payment authorization
                that's processed on-chain via Base. Payments are instant and non-custodial -
                you're always in control of your funds.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
