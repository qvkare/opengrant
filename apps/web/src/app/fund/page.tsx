"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import { listFundedRepos, getFundStats } from "@/lib/api";

interface FundedRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
  forks: number;
  avatarUrl: string | null;
  totalFunded: string;
  donorCount: number;
  claimStatus: string;
}

interface FundStats {
  totalFunded: string;
  totalClaimed: string;
  repoCount: number;
  donorCount: number;
}

const languages = ["All", "JavaScript", "TypeScript", "Rust", "Go", "Python"];
const sortOptions = [
  { value: "stars", label: "Stars" },
  { value: "funded", label: "Most Funded" },
  { value: "donors", label: "Most Donors" },
];

function formatUSDCAmount(amount: string): string {
  const num = parseFloat(amount);
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  if (num > 0) return `$${num.toFixed(2)}`;
  return "$0";
}

function RepoCard({ repo }: { repo: FundedRepo }) {
  const funded = parseFloat(repo.totalFunded);

  return (
    <Link href={`/fund/${repo.owner}/${repo.name}`}>
      <Card className="hover:border-black/30 transition-colors h-full">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            {repo.avatarUrl && (
              <img
                src={repo.avatarUrl}
                alt={repo.owner}
                className="w-10 h-10 rounded-full"
              />
            )}
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base truncate">{repo.fullName}</CardTitle>
              <div className="flex items-center gap-2 mt-1">
                {repo.language && (
                  <Badge variant="secondary" className="text-xs">
                    {repo.language}
                  </Badge>
                )}
                {repo.claimStatus === "claimed" && (
                  <Badge variant="default" className="text-xs bg-green-600">
                    Claimed
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {repo.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {repo.description}
            </p>
          )}

          <div className="flex items-center justify-between pt-2 border-t text-sm">
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <span>{formatNumber(repo.stars)}</span>
            </div>
            <div>
              <span className="font-medium text-green-500">
                {formatUSDCAmount(repo.totalFunded)}
              </span>
              <span className="text-muted-foreground ml-1">funded</span>
            </div>
            <div className="text-muted-foreground">
              {repo.donorCount} {repo.donorCount === 1 ? "donor" : "donors"}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function FundExplorePage() {
  const [repos, setRepos] = useState<FundedRepo[]>([]);
  const [stats, setStats] = useState<FundStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("All");
  const [sortBy, setSortBy] = useState("stars");
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 24;

  useEffect(() => {
    async function fetchData() {
      try {
        const [repoResult, statsResult] = await Promise.all([
          listFundedRepos({
            language: selectedLanguage === "All" ? undefined : selectedLanguage,
            sort: sortBy as "stars" | "funded" | "donors",
            q: searchQuery || undefined,
            limit,
            offset,
          }),
          getFundStats(),
        ]);
        setRepos(repoResult.data);
        setTotal(repoResult.pagination.total);
        setStats(statsResult);
      } catch {
        // API unavailable
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [selectedLanguage, sortBy, searchQuery, offset]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Testnet Banner */}
      <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-center text-sm">
        <span className="font-medium text-yellow-700">World Chain Sepolia Testnet</span>
        <span className="text-yellow-600"> — All donations use test USDC. No real funds involved.</span>
      </div>

      {/* Stats Banner */}
      {stats && (
        <div className="mb-8 p-6 bg-gray-50 border border-gray-100 rounded-xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-500">
                {formatUSDCAmount(stats.totalFunded)}
              </p>
              <p className="text-sm text-muted-foreground">Total Funded</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.repoCount}</p>
              <p className="text-sm text-muted-foreground">Projects</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.donorCount}</p>
              <p className="text-sm text-muted-foreground">Donors</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-green-500">
                {formatUSDCAmount(stats.totalClaimed)}
              </p>
              <p className="text-sm text-muted-foreground">Claimed</p>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Fund Open Source
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-6">
          Support the open source projects you depend on with trustless USDC escrow.
        </p>
        <div className="flex justify-center gap-3">
          <Link href="/fund/stack">
            <Button size="lg">Fund Your Stack</Button>
          </Link>
          <Link href="/fund/claim">
            <Button size="lg" variant="outline">Claim Funds</Button>
          </Link>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setOffset(0); }}
            className="w-full pl-10 pr-4 py-2 bg-background border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value); setOffset(0); }}
          className="px-4 py-2 bg-background border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Language Tabs */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {languages.map((lang) => (
          <Button
            key={lang}
            variant={selectedLanguage === lang ? "default" : "outline"}
            size="sm"
            onClick={() => { setSelectedLanguage(lang); setOffset(0); }}
          >
            {lang}
          </Button>
        ))}
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
        </div>
      ) : repos.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {repos.map((repo) => (
              <RepoCard key={repo.id} repo={repo} />
            ))}
          </div>

          {/* Pagination */}
          {total > limit && (
            <div className="flex justify-center gap-2 mt-8">
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                Previous
              </Button>
              <span className="flex items-center px-4 text-sm text-muted-foreground">
                {offset + 1}-{Math.min(offset + limit, total)} of {total}
              </span>
              <Button
                variant="outline"
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <h3 className="text-lg font-medium">No projects found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Try adjusting your search or filters
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
