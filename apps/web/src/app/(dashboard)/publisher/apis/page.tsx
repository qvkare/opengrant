"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUSDC } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useApiAuth } from "@/hooks/useApiAuth";
import { getPublisherApis } from "@/lib/api";

interface PublisherApi {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  baseUrl: string;
  totalCalls: number;
  totalRevenue: string;
  githubRepoId: string | null;
  githubRepo?: { owner: string; name: string; fullName: string } | null;
  endpoints: {
    id: string;
    path: string;
    method: string;
    description: string;
    pricePerCall: number;
    isActive: boolean;
  }[];
  createdAt: string;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        status === "active"
          ? "bg-green-500/10 text-green-500"
          : status === "paused"
            ? "bg-yellow-500/10 text-yellow-500"
            : "bg-red-500/10 text-red-500"
      )}
    >
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full mr-1.5",
          status === "active"
            ? "bg-green-500"
            : status === "paused"
              ? "bg-yellow-500"
              : "bg-red-500"
        )}
      />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-blue-500/10 text-blue-500",
    POST: "bg-green-500/10 text-green-500",
    PUT: "bg-yellow-500/10 text-yellow-500",
    DELETE: "bg-red-500/10 text-red-500",
    PATCH: "bg-purple-500/10 text-purple-500",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-medium",
        colors[method] || "bg-gray-500/10 text-gray-500"
      )}
    >
      {method}
    </span>
  );
}

export default function PublisherAPIsPage() {
  const { token } = useApiAuth("publisher");
  const [filter, setFilter] = useState<"all" | "active" | "paused">("all");
  const [apiList, setApiList] = useState<PublisherApi[]>([]);

  const fetchApis = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getPublisherApis(token);
      setApiList(data);
    } catch {
      // API unavailable
    }
  }, [token]);

  useEffect(() => {
    fetchApis();
  }, [fetchApis]);

  const filteredAPIs = apiList.filter((api) => {
    if (filter === "all") return true;
    return api.status === filter;
  });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My APIs</h1>
          <p className="text-muted-foreground">
            Manage your registered APIs and endpoints
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

      {/* Filters */}
      <div className="flex gap-2">
        {(["all", "active", "paused"] as const).map((status) => (
          <Button
            key={status}
            variant={filter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(status)}
          >
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </Button>
        ))}
      </div>

      {/* API List */}
      <div className="space-y-4">
        {filteredAPIs.map((api) => (
          <Card key={api.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <CardTitle>{api.name}</CardTitle>
                    <StatusBadge status={api.status} />
                    {api.githubRepoId && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-500/10 text-purple-500">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                        </svg>
                        {api.githubRepo?.fullName || "Linked"}
                      </span>
                    )}
                  </div>
                  <CardDescription className="mt-1">
                    {api.description}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Link href={`/publisher/apis/${api.slug}/edit`}>
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                  <Link href={`/publisher/apis/${api.slug}`}>
                    <Button size="sm">View Details</Button>
                  </Link>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div>
                  <p className="text-sm text-muted-foreground">Total Calls</p>
                  <p className="text-2xl font-bold">
                    {api.totalCalls.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-500">
                    {formatUSDC(api.totalRevenue)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Base URL</p>
                  <p className="text-sm font-mono text-muted-foreground truncate">
                    {api.baseUrl}
                  </p>
                </div>
              </div>

              {/* Endpoints */}
              <div>
                <h4 className="text-sm font-medium mb-3">Endpoints</h4>
                <div className="space-y-2">
                  {api.endpoints.map((endpoint) => (
                    <div
                      key={endpoint.id || endpoint.path}
                      className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <MethodBadge method={endpoint.method} />
                        <span className="font-mono text-sm">{endpoint.path}</span>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <span className={cn(
                          "text-xs",
                          endpoint.isActive ? "text-green-500" : "text-muted-foreground"
                        )}>
                          {endpoint.isActive ? "Active" : "Inactive"}
                        </span>
                        <span className="font-medium">
                          {formatUSDC(endpoint.pricePerCall.toString())}/call
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredAPIs.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <svg
                className="mx-auto h-12 w-12 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium">No APIs found</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {filter === "all"
                  ? "Get started by registering your first API."
                  : `No ${filter} APIs found.`}
              </p>
              {filter === "all" && (
                <Link href="/publisher/apis/new">
                  <Button className="mt-4">Register Your First API</Button>
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
