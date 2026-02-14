"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatUSDC, formatAddress } from "@/lib/utils";
import { useApiAuth } from "@/hooks/useApiAuth";
import { getConsumerStats, getConsumerBalance, listApiKeys } from "@/lib/api";

function StatCard({
  title,
  value,
  description,
  icon,
  action,
}: {
  title: string;
  value: string;
  description?: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {action && <div className="mt-2">{action}</div>}
      </CardContent>
    </Card>
  );
}

export default function ConsumerDashboard() {
  const { address } = useWallet();
  const { token } = useApiAuth("consumer");
  const walletAddress = address;

  const [stats, setStats] = useState({
    balance: "0",
    totalSpent: "0",
    apiKeysCount: 0,
    thisMonthCalls: 0,
    recentUsage: [] as { api: string; endpoint: string; calls: number; spent: string; time: string }[],
    topAPIs: [] as { name: string; calls: number; spent: string; lastUsed: string }[],
  });

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [statsData, balanceData, keysData] = await Promise.all([
        getConsumerStats(token, "30d"),
        getConsumerBalance(token),
        listApiKeys(token),
      ]);

      const activeKeys = keysData.filter((k) => k.isActive);

      setStats({
        balance: ((parseFloat(balanceData.usdc) || 0) * 1_000_000).toFixed(0),
        totalSpent: statsData.totalSpent,
        apiKeysCount: activeKeys.length,
        thisMonthCalls: statsData.totalCalls,
        recentUsage: statsData.apiBreakdown.slice(0, 3).map((item) => ({
          api: item.apiId.slice(0, 8),
          endpoint: "-",
          calls: item.calls,
          spent: item.spent,
          time: "This period",
        })),
        topAPIs: statsData.apiBreakdown.slice(0, 3).map((item) => ({
          name: item.apiId.slice(0, 8),
          calls: item.calls,
          spent: item.spent,
          lastUsed: "-",
        })),
      });
    } catch {
      // API unavailable - keep defaults
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Consumer Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back{walletAddress ? `, ${formatAddress(walletAddress)}` : ""}
          </p>
        </div>
        <Link href="/explore">
          <Button>
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
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            Explore APIs
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="USDC Balance"
          value={formatUSDC(stats.balance)}
          description="Available for API calls"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          action={
            <Link href="/consumer/fund">
              <Button size="sm" variant="outline">
                Add Funds
              </Button>
            </Link>
          }
        />
        <StatCard
          title="Total Spent"
          value={formatUSDC(stats.totalSpent)}
          description="All time"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
        />
        <StatCard
          title="API Keys"
          value={stats.apiKeysCount.toString()}
          description="Active keys"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          }
          action={
            <Link href="/consumer/api-keys">
              <Button size="sm" variant="outline">
                Manage Keys
              </Button>
            </Link>
          }
        />
        <StatCard
          title="This Month"
          value={stats.thisMonthCalls.toLocaleString()}
          description="API calls"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Usage */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Your latest API usage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentUsage.map((usage, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div>
                    <p className="font-medium">{usage.api}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {usage.endpoint} &middot; {usage.time}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{usage.calls} calls</p>
                    <p className="text-xs text-muted-foreground">
                      {formatUSDC(usage.spent)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/consumer/usage">
              <Button variant="outline" className="w-full mt-4">
                View All Usage
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Top APIs */}
        <Card>
          <CardHeader>
            <CardTitle>Most Used APIs</CardTitle>
            <CardDescription>By call count</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.topAPIs.map((api, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{api.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Last used: {api.lastUsed}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {api.calls.toLocaleString()} calls
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatUSDC(api.spent)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/explore">
              <Button variant="outline" className="w-full mt-4">
                Discover More APIs
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Link href="/consumer/fund">
              <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Funds
              </Button>
            </Link>
            <Link href="/consumer/api-keys">
              <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                Create API Key
              </Button>
            </Link>
            <Link href="/explore">
              <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Explore APIs
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Getting Started Guide */}
      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>How to use OpenGrant APIs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                1
              </div>
              <div>
                <h4 className="font-medium">Fund Your Wallet</h4>
                <p className="text-sm text-muted-foreground">
                  Add USDC to your wallet using Coinbase Onramp or direct transfer.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                2
              </div>
              <div>
                <h4 className="font-medium">Create an API Key</h4>
                <p className="text-sm text-muted-foreground">
                  Generate an API key to authenticate your requests.
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                3
              </div>
              <div>
                <h4 className="font-medium">Make API Calls</h4>
                <p className="text-sm text-muted-foreground">
                  Use our SDK or make direct HTTP requests. Payments are handled automatically via x402.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
