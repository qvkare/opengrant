"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUSDC } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { listApis } from "@/lib/api";

interface ApiItem {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string | null;
  logoUrl: string | null;
  tags: string[] | null;
  totalCalls: number;
  totalRevenue: string;
  publishedAt: string;
}

const categories = ["All", "Design", "Development", "AI/ML", "Media", "Data"];

function formatCalls(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(0)}K`;
  }
  return num.toString();
}

function APICard({ api }: { api: ApiItem }) {
  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{api.name}</CardTitle>
          </div>
          {api.category && (
            <span className="px-2 py-1 rounded-md text-xs font-medium bg-muted">
              {api.category}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {api.description}
        </p>

        {api.tags && api.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {api.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            <p className="text-sm font-medium text-green-500">
              {formatUSDC(api.totalRevenue)}
            </p>
            <p className="text-xs text-muted-foreground">total revenue</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{formatCalls(api.totalCalls)}</p>
            <p className="text-xs text-muted-foreground">total calls</p>
          </div>
        </div>

        <Link href={`/${api.slug}`}>
          <Button className="w-full">View API</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export default function ExplorePage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [sortBy, setSortBy] = useState<"popular" | "newest" | "price">("popular");
  const [apiList, setApiList] = useState<ApiItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchApis() {
      try {
        const result = await listApis({ limit: 50 });
        setApiList(result.data);
      } catch {
        // API unavailable
      } finally {
        setLoading(false);
      }
    }
    fetchApis();
  }, []);

  const filteredAPIs = apiList
    .filter((api) => {
      const matchesSearch =
        api.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (api.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (api.tags || []).some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory =
        selectedCategory === "All" || api.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      if (sortBy === "popular") return b.totalCalls - a.totalCalls;
      return 0;
    });

  const topAPIs = apiList.slice(0, 3);

  return (
    <div className="container py-8">
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Explore APIs
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Discover and integrate powerful APIs from open-source projects.
          Pay only for what you use with x402 micropayments.
        </p>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground"
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
          <input
            type="text"
            placeholder="Search APIs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="px-4 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="popular">Most Popular</option>
            <option value="newest">Newest</option>
            <option value="price">Lowest Price</option>
          </select>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {categories.map((category) => (
          <Button
            key={category}
            variant={selectedCategory === category ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </Button>
        ))}
      </div>

      {/* Featured Section */}
      {selectedCategory === "All" && searchQuery === "" && topAPIs.length > 0 && (
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Top APIs</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {topAPIs.map((api) => (
              <APICard key={api.id} api={api} />
            ))}
          </div>
        </div>
      )}

      {/* All APIs */}
      <div>
        <h2 className="text-2xl font-bold mb-6">
          {selectedCategory === "All" ? "All APIs" : selectedCategory}
        </h2>
        {filteredAPIs.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredAPIs.map((api) => (
              <APICard key={api.id} api={api} />
            ))}
          </div>
        ) : (
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
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <h3 className="mt-4 text-lg font-medium">No APIs found</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Try adjusting your search or filters
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* CTA Section */}
      <div className="mt-16 text-center py-12 bg-gradient-to-r from-blue-500/10 to-purple-600/10 rounded-xl">
        <h2 className="text-2xl font-bold mb-4">Have an API to share?</h2>
        <p className="text-muted-foreground mb-6 max-w-xl mx-auto">
          Join OpenGrant and start earning from your open-source APIs.
          Simple setup, instant payments, zero infrastructure costs.
        </p>
        <Link href="/publisher">
          <Button size="lg">
            Become a Publisher
          </Button>
        </Link>
      </div>
    </div>
  );
}
