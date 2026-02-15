"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatUSDC, formatAddress } from "@/lib/utils";
import { useApiAuth } from "@/hooks/useApiAuth";
import { getPublisherAnalytics, getPublisherEarnings, getPublisherApis } from "@/lib/api";

function StatCard({
  title,
  value,
  description,
  icon,
}: {
  title: string;
  value: string;
  description?: string;
  icon: React.ReactNode;
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
      </CardContent>
    </Card>
  );
}

export default function PublisherDashboard() {
  const { address } = useWallet();
  const { token } = useApiAuth("publisher");
  const walletAddress = address;

  const [stats, setStats] = useState({
    totalRevenue: "0",
    totalCalls: 0,
    activeAPIs: 0,
    pendingWithdrawal: "0",
    recentActivity: [] as { endpoint: string; calls: number; revenue: string; time: string }[],
    topAPIs: [] as { name: string; calls: number; revenue: string; growth: number }[],
  });

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [analytics, earnings, apiList] = await Promise.all([
        getPublisherAnalytics(token, "30d"),
        getPublisherEarnings(token),
        getPublisherApis(token),
      ]);

      const activeCount = apiList.filter((a) => a.status === "active").length;

      setStats({
        totalRevenue: analytics.totalRevenue,
        totalCalls: analytics.totalCalls,
        activeAPIs: activeCount,
        pendingWithdrawal: earnings.availableBalance,
        recentActivity: analytics.daily.slice(-3).reverse().map((d) => ({
          endpoint: d.date,
          calls: d.calls,
          revenue: d.revenue,
          time: "Daily",
        })),
        topAPIs: analytics.byApi.slice(0, 3).map((a) => ({
          name: a.apiName,
          calls: a.calls,
          revenue: a.revenue,
          growth: 0,
        })),
      });
    } catch {
      // API unavailable
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
          <h1 className="text-3xl font-bold tracking-tight">Publisher Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back{walletAddress ? `, ${formatAddress(walletAddress)}` : ""}
          </p>
        </div>
        <Link href="/publisher/apis/new">
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            Register API
          </Button>
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Revenue"
          value={formatUSDC(stats.totalRevenue)}
          description="All time earnings"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          title="Total API Calls"
          value={stats.totalCalls.toLocaleString()}
          description="Last 30 days"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          }
        />
        <StatCard
          title="Active APIs"
          value={stats.activeAPIs.toString()}
          description="Currently registered"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          }
        />
        <StatCard
          title="Available for Withdrawal"
          value={formatUSDC(stats.pendingWithdrawal)}
          description="Ready to withdraw"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Real-time endpoint usage</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentActivity.map((activity, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div>
                    <p className="font-mono text-sm">{activity.endpoint}</p>
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{activity.calls.toLocaleString()} calls</p>
                    <p className="text-xs text-green-500">
                      +{formatUSDC(activity.revenue)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/publisher/analytics">
              <Button variant="outline" className="w-full mt-4">
                View All Analytics
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Top APIs */}
        <Card>
          <CardHeader>
            <CardTitle>Top Performing APIs</CardTitle>
            <CardDescription>By revenue this month</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.topAPIs.map((api, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white text-xs font-bold">
                      {index + 1}
                    </div>
                    <div>
                      <p className="font-medium">{api.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {api.calls.toLocaleString()} calls
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatUSDC(api.revenue)}</p>
                    <p
                      className={`text-xs ${
                        api.growth >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {api.growth >= 0 ? "+" : ""}
                      {api.growth}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/publisher/apis">
              <Button variant="outline" className="w-full mt-4">
                Manage APIs
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
            <Link href="/publisher/apis/new">
              <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Register New API
              </Button>
            </Link>
            <Link href="/publisher/earnings">
              <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Withdraw Earnings
              </Button>
            </Link>
            <Link href="/publisher/settings">
              <Button variant="outline" className="w-full h-auto py-4 flex flex-col gap-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Configure Settings
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
