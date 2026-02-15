"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUSDC } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useApiAuth } from "@/hooks/useApiAuth";
import { getConsumerStats, getConsumerUsage } from "@/lib/api";

interface UsageData {
  summary: { totalCalls: number; totalSpent: string; avgCostPerCall: string };
  dailyData: { date: string; calls: number; spent: string }[];
  recentCalls: {
    id: string;
    api: string;
    endpoint: string;
    cost: string;
    responseTime: number;
    timestamp: string;
    status: string;
  }[];
  byApi: { api: string; calls: number; spent: string; percentage: number }[];
}

export default function ConsumerUsagePage() {
  const { token } = useApiAuth("consumer");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");
  const [usage, setUsage] = useState<UsageData>({
    summary: { totalCalls: 0, totalSpent: "0", avgCostPerCall: "0" },
    dailyData: [],
    recentCalls: [],
    byApi: [],
  });

  const fetchUsage = useCallback(async () => {
    if (!token) return;
    try {
      const [statsData, recentData] = await Promise.all([
        getConsumerStats(token, period),
        getConsumerUsage(token, { limit: 10 }),
      ]);

      const totalCalls = statsData.totalCalls || 0;
      const totalSpent = statsData.totalSpent || "0";
      const avgCostPerCall = totalCalls > 0
        ? Math.round(parseInt(totalSpent) / totalCalls).toString()
        : "0";

      const totalCallsByApi = statsData.apiBreakdown.reduce((sum, a) => sum + a.calls, 0) || 1;

      setUsage({
        summary: { totalCalls, totalSpent, avgCostPerCall },
        dailyData: statsData.dailyUsage.map((d) => ({
          date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          calls: d.calls,
          spent: d.spent,
        })),
        recentCalls: recentData.map((r) => ({
          id: r.id,
          api: r.apiId.slice(0, 8),
          endpoint: r.endpointId?.slice(0, 8) || "-",
          cost: r.priceCharged.toString(),
          responseTime: r.responseTimeMs || 0,
          timestamp: r.requestTimestamp,
          status: r.statusCode < 400 ? "success" : "error",
        })),
        byApi: statsData.apiBreakdown.map((a) => ({
          api: a.apiId.slice(0, 8),
          calls: a.calls,
          spent: a.spent,
          percentage: Math.round((a.calls / totalCallsByApi) * 100),
        })),
      });
    } catch {
      // API unavailable
    }
  }, [token, period]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Usage</h1>
          <p className="text-muted-foreground">
            Track your API usage and costs
          </p>
        </div>
        <div className="flex gap-2">
          {(["7d", "30d", "90d"] as const).map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p === "7d" ? "7 Days" : p === "30d" ? "30 Days" : "90 Days"}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total API Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage.summary.totalCalls.toLocaleString()}
            </div>
            <p className="text-xs text-green-500 mt-1">+15% from last period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Spent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatUSDC(usage.summary.totalSpent)}
            </div>
            <p className="text-xs text-green-500 mt-1">+12% from last period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Cost per Call
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatUSDC(usage.summary.avgCostPerCall)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Across all APIs</p>
          </CardContent>
        </Card>
      </div>

      {/* Usage by API */}
      <Card>
        <CardHeader>
          <CardTitle>Usage by API</CardTitle>
          <CardDescription>Your most used APIs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {usage.byApi.map((api, index) => (
              <div key={index}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{api.api}</span>
                  <span className="text-muted-foreground">
                    {api.calls.toLocaleString()} calls &middot; {formatUSDC(api.spent)}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div
                    className="bg-black h-3 rounded-full transition-all"
                    style={{ width: `${api.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Daily Usage Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Usage</CardTitle>
          <CardDescription>API calls per day</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {usage.dailyData.map((day, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-12">
                  {day.date}
                </span>
                <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                  <div
                    className="bg-black h-full rounded-full transition-all"
                    style={{
                      width: `${(day.calls / Math.max(...usage.dailyData.map((d) => d.calls))) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-medium w-20 text-right">
                  {day.calls.toLocaleString()} calls
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent API Calls */}
      <Card>
        <CardHeader>
          <CardTitle>Recent API Calls</CardTitle>
          <CardDescription>Your latest API requests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {usage.recentCalls.map((call) => (
              <div
                key={call.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      call.status === "success" ? "bg-green-500" : "bg-red-500"
                    )}
                  />
                  <div>
                    <p className="font-medium text-sm">{call.api}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {call.endpoint}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-sm">
                  <span className="text-muted-foreground">
                    {call.responseTime}ms
                  </span>
                  <span className="font-medium">{formatUSDC(call.cost)}</span>
                  <span className="text-xs text-muted-foreground w-24">
                    {new Date(call.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
