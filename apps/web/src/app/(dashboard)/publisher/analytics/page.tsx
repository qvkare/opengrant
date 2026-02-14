"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUSDC } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useApiAuth } from "@/hooks/useApiAuth";
import { getPublisherAnalytics } from "@/lib/api";

interface AnalyticsData {
  summary: { totalCalls: number; totalRevenue: string; avgResponseTime: number; errorRate: number };
  dailyData: { date: string; calls: number; revenue: string }[];
  topEndpoints: { endpoint: string; calls: number; revenue: string; avgTime: number }[];
}

function SimpleBarChart({
  data,
  valueKey,
  labelKey,
}: {
  data: Record<string, any>[];
  valueKey: string;
  labelKey: string;
}) {
  const maxValue = Math.max(...data.map((d) => d[valueKey]));

  return (
    <div className="space-y-2">
      {data.map((item, index) => (
        <div key={index} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-12">{item[labelKey]}</span>
          <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
            <div
              className="bg-gradient-to-r from-blue-500 to-purple-600 h-full rounded-full transition-all"
              style={{ width: `${(item[valueKey] / maxValue) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium w-16 text-right">
            {item[valueKey].toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function PublisherAnalyticsPage() {
  const { token } = useApiAuth("publisher");
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("7d");
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    summary: { totalCalls: 0, totalRevenue: "0", avgResponseTime: 0, errorRate: 0 },
    dailyData: [],
    topEndpoints: [],
  });

  const fetchAnalytics = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getPublisherAnalytics(token, period);
      setAnalytics({
        summary: {
          totalCalls: data.totalCalls,
          totalRevenue: data.totalRevenue,
          avgResponseTime: data.avgResponseTime,
          errorRate: 0,
        },
        dailyData: data.daily.map((d) => ({
          date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          calls: d.calls,
          revenue: d.revenue,
        })),
        topEndpoints: data.byApi.map((a) => ({
          endpoint: a.apiName,
          calls: a.calls,
          revenue: a.revenue,
          avgTime: a.avgResponseTime,
        })),
      });
    } catch {
      // API unavailable
    }
  }, [token, period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Detailed insights into your API usage
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total API Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics.summary.totalCalls.toLocaleString()}
            </div>
            <p className="text-xs text-green-500 mt-1">+12.5% from last period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              {formatUSDC(analytics.summary.totalRevenue)}
            </div>
            <p className="text-xs text-green-500 mt-1">+8.3% from last period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Response Time
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {analytics.summary.avgResponseTime}ms
            </div>
            <p className="text-xs text-green-500 mt-1">-5ms from last period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Error Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(analytics.summary.errorRate * 100).toFixed(2)}%
            </div>
            <p className="text-xs text-green-500 mt-1">-0.01% from last period</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Daily Calls Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Daily API Calls</CardTitle>
            <CardDescription>Number of calls per day</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={analytics.dailyData}
              valueKey="calls"
              labelKey="date"
            />
          </CardContent>
        </Card>

        {/* Daily Revenue Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Daily Revenue</CardTitle>
            <CardDescription>Revenue generated per day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analytics.dailyData.map((item, index) => (
                <div key={index} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-12">
                    {item.date}
                  </span>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-green-500 to-emerald-600 h-full rounded-full transition-all"
                      style={{
                        width: `${(parseInt(item.revenue) / Math.max(...analytics.dailyData.map((d) => parseInt(d.revenue)))) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs font-medium w-16 text-right">
                    {formatUSDC(item.revenue)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Endpoints */}
      <Card>
        <CardHeader>
          <CardTitle>Top Endpoints</CardTitle>
          <CardDescription>Most used endpoints by call count</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analytics.topEndpoints.map((endpoint, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-3 border-b last:border-0"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-mono text-sm">{endpoint.endpoint}</p>
                    <p className="text-xs text-muted-foreground">
                      Avg response: {endpoint.avgTime}ms
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {endpoint.calls.toLocaleString()} calls
                  </p>
                  <p className="text-sm text-green-500">
                    {formatUSDC(endpoint.revenue)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Top APIs by Revenue */}
      {analytics.topEndpoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Revenue by API</CardTitle>
            <CardDescription>Revenue breakdown per API</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.topEndpoints.map((item, index) => {
                const maxRevenue = Math.max(...analytics.topEndpoints.map((e) => parseInt(e.revenue) || 0)) || 1;
                return (
                  <div key={index}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{item.endpoint}</span>
                      <span className="text-green-500">{formatUSDC(item.revenue)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-green-500 to-emerald-600 h-2 rounded-full"
                        style={{ width: `${(parseInt(item.revenue) / maxRevenue) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
