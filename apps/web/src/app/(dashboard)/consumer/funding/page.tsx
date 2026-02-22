"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatAddress } from "@/lib/utils";
import { useApiAuth } from "@/hooks/useApiAuth";
import { getMyDonations } from "@/lib/api";

interface FundDonation {
  id: string;
  amount: string;
  txHash: string;
  chainId: number;
  status: string;
  source: string;
  redistributeOnTimeout: boolean;
  refundEligibleAt: string | null;
  createdAt: string;
  repoOwner: string;
  repoName: string;
  repoFullName: string;
  repoAvatarUrl: string | null;
}

function formatUSDCAmount(amount: string): string {
  const num = parseFloat(amount);
  if (num > 0) return `$${num.toFixed(2)}`;
  return "$0";
}

function StatusBadge({ status, refundEligibleAt }: { status: string; refundEligibleAt: string | null }) {
  const isRefundable = refundEligibleAt && new Date(refundEligibleAt) <= new Date();

  switch (status) {
    case "confirmed":
      return isRefundable ? (
        <Badge variant="outline" className="border-yellow-500 text-yellow-600">Refundable</Badge>
      ) : (
        <Badge variant="secondary">Confirmed</Badge>
      );
    case "refunded":
      return <Badge variant="outline">Refunded</Badge>;
    case "redistributed":
      return <Badge variant="outline">Redistributed</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

const chainNames: Record<number, string> = {
  1: "Ethereum",
  8453: "Base",
  42161: "Arbitrum",
  59144: "Linea",
  137: "Polygon",
  84532: "Base Sepolia",
  421614: "Arb Sepolia",
  59141: "Linea Sepolia",
  80002: "Polygon Amoy",
  480: "World Chain",
  4801: "World Chain Sepolia",
};

export default function ConsumerFundingPage() {
  const { token } = useApiAuth();
  const [donations, setDonations] = useState<FundDonation[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  useEffect(() => {
    if (!token) return;

    async function fetchDonations() {
      try {
        const result = await getMyDonations(token!, { limit, offset });
        setDonations(result.data);
        setTotal(result.pagination.total);
      } catch {
        // API unavailable
      } finally {
        setLoading(false);
      }
    }
    fetchDonations();
  }, [token, offset]);

  const totalFunded = donations
    .filter((d) => d.status === "confirmed")
    .reduce((sum, d) => sum + parseFloat(d.amount), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Funding History</h1>
          <p className="text-muted-foreground">Your open source project donations</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-green-500">
            {formatUSDCAmount(totalFunded.toString())}
          </p>
          <p className="text-sm text-muted-foreground">Total donated</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black" />
        </div>
      ) : donations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <svg className="mx-auto h-12 w-12 text-muted-foreground mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            <h3 className="text-lg font-medium mb-1">No donations yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Start funding open source projects you depend on
            </p>
            <a href="/fund">
              <Button>Explore Projects</Button>
            </a>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {donations.map((donation) => (
              <Card key={donation.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {donation.repoAvatarUrl && (
                        <img
                          src={donation.repoAvatarUrl}
                          alt={donation.repoOwner}
                          className="w-8 h-8 rounded-full"
                        />
                      )}
                      <div>
                        <a
                          href={`/fund/${donation.repoOwner}/${donation.repoName}`}
                          className="text-sm font-medium hover:text-black"
                        >
                          {donation.repoFullName}
                        </a>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {new Date(donation.createdAt).toLocaleDateString()}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {chainNames[donation.chainId] || `Chain ${donation.chainId}`}
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {donation.source}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <StatusBadge
                        status={donation.status}
                        refundEligibleAt={donation.refundEligibleAt}
                      />
                      <span className="font-medium text-green-500">
                        {formatUSDCAmount(donation.amount)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {total > limit && (
            <div className="flex justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                Previous
              </Button>
              <span className="flex items-center px-3 text-sm text-muted-foreground">
                {offset + 1}-{Math.min(offset + limit, total)} of {total}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + limit >= total}
                onClick={() => setOffset(offset + limit)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
