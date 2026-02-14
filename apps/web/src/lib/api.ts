const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

function withAuth(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

// ============================================
// Consumer API
// ============================================

export async function createApiKey(
  token: string,
  data: { name: string; allowedApis?: string[] }
) {
  return apiFetch<{
    id: string;
    name: string;
    key: string;
    prefix: string;
    allowedApis: string[] | null;
    expiresAt: string | null;
    createdAt: string;
  }>("/v1/consumer/keys", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify(data),
  });
}

export async function listApiKeys(token: string) {
  return apiFetch<
    {
      id: string;
      name: string;
      prefix: string;
      allowedApis: string[] | null;
      lastUsedAt: string | null;
      expiresAt: string | null;
      createdAt: string;
      isActive: boolean;
    }[]
  >("/v1/consumer/keys", {
    headers: withAuth(token),
  });
}

export async function revokeApiKey(token: string, keyId: string) {
  return apiFetch<{ success: boolean }>(`/v1/consumer/keys/${keyId}`, {
    method: "DELETE",
    headers: withAuth(token),
  });
}

// ============================================
// Publisher API
// ============================================

export async function registerApi(
  token: string,
  data: {
    name: string;
    slug: string;
    description?: string;
    baseUrl: string;
  }
) {
  return apiFetch<{ id: string; slug: string; name: string; status: string }>(
    "/v1/apis",
    {
      method: "POST",
      headers: withAuth(token),
      body: JSON.stringify(data),
    }
  );
}

export async function addEndpoint(
  token: string,
  apiId: string,
  data: {
    path: string;
    method: string;
    description?: string;
    pricePerCall: number;
    rateLimitPerMinute: number;
  }
) {
  return apiFetch<{ id: string }>(`/v1/apis/${apiId}/endpoints`, {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify(data),
  });
}

export async function publishApi(token: string, apiId: string) {
  return apiFetch<{ id: string; status: string }>(
    `/v1/apis/${apiId}/publish`,
    {
      method: "POST",
      headers: withAuth(token),
    }
  );
}

export async function getPublisherEarnings(token: string) {
  return apiFetch<{
    availableBalance: string;
    pendingBalance: string;
    lifetimeEarnings: string;
    platformFeesPaid: string;
    recentPayments: {
      api: string;
      amount: string;
      from: string;
      time: string;
    }[];
    withdrawals: {
      id: string;
      amount: string;
      txHash: string;
      status: string;
      timestamp: string;
    }[];
  }>("/v1/publisher/earnings", {
    headers: withAuth(token),
  });
}

export async function requestWithdrawal(
  token: string,
  data: { amount: string }
) {
  return apiFetch<{ id: string; txHash: string; status: string }>(
    "/v1/publisher/withdraw",
    {
      method: "POST",
      headers: withAuth(token),
      body: JSON.stringify(data),
    }
  );
}

// ============================================
// Consumer Stats & Data
// ============================================

export async function getConsumerStats(token: string, period: string = "30d") {
  return apiFetch<{
    totalCalls: number;
    totalSpent: string;
    avgResponseTime: number;
    apiBreakdown: {
      apiId: string;
      calls: number;
      spent: string;
      avgResponseTime: number;
    }[];
    dailyUsage: {
      date: string;
      calls: number;
      spent: string;
    }[];
    period: { start: string; end: string; days: number };
  }>(`/v1/consumer/stats?period=${period}`, {
    headers: withAuth(token),
  });
}

export async function getConsumerBalance(token: string) {
  return apiFetch<{
    walletAddress: string;
    creditBalance: string;
    usdc: string;
    eth: string;
  }>("/v1/consumer/balance", {
    headers: withAuth(token),
  });
}

export async function getConsumerPayments(
  token: string,
  params: { limit?: number; offset?: number } = {}
) {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", params.limit.toString());
  if (params.offset) query.set("offset", params.offset.toString());
  const qs = query.toString();
  return apiFetch<{
    data: {
      id: string;
      apiId: string;
      endpointId: string;
      requestId: string;
      priceCharged: number;
      paymentTxHash: string;
      paymentStatus: string;
      requestTimestamp: string;
      settledAt: string | null;
    }[];
    pagination: { limit: number; offset: number; total: number };
  }>(`/v1/consumer/payments${qs ? `?${qs}` : ""}`, {
    headers: withAuth(token),
  });
}

export async function getConsumerUsage(
  token: string,
  params: { limit?: number; offset?: number; apiId?: string } = {}
) {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", params.limit.toString());
  if (params.offset) query.set("offset", params.offset.toString());
  if (params.apiId) query.set("apiId", params.apiId);
  const qs = query.toString();
  return apiFetch<
    {
      id: string;
      apiId: string;
      endpointId: string;
      consumerId: string;
      requestId: string;
      priceCharged: number;
      responseTimeMs: number;
      statusCode: number;
      paymentStatus: string;
      paymentTxHash: string | null;
      requestTimestamp: string;
    }[]
  >(`/v1/consumer/usage${qs ? `?${qs}` : ""}`, {
    headers: withAuth(token),
  });
}

// ============================================
// Publisher Stats & Data
// ============================================

export async function getPublisherApis(token: string) {
  return apiFetch<
    {
      id: string;
      slug: string;
      name: string;
      description: string;
      baseUrl: string;
      status: string;
      category: string | null;
      githubRepoId: string | null;
      totalCalls: number;
      totalRevenue: string;
      createdAt: string;
      endpoints: {
        id: string;
        path: string;
        method: string;
        description: string;
        pricePerCall: number;
        isActive: boolean;
      }[];
    }[]
  >("/v1/publisher/apis", {
    headers: withAuth(token),
  });
}

export async function getPublisherAnalytics(
  token: string,
  period: string = "30d"
) {
  return apiFetch<{
    totalCalls: number;
    totalRevenue: string;
    avgResponseTime: number;
    byApi: {
      apiId: string;
      apiName: string;
      apiSlug: string;
      calls: number;
      revenue: string;
      avgResponseTime: number;
    }[];
    daily: {
      date: string;
      calls: number;
      revenue: string;
    }[];
    period: { start: string; end: string; days: number };
  }>(`/v1/publisher/analytics?period=${period}`, {
    headers: withAuth(token),
  });
}

// ============================================
// Public API
// ============================================

export async function listApis(params: {
  category?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.category) query.set("category", params.category);
  if (params.limit) query.set("limit", params.limit.toString());
  if (params.offset) query.set("offset", params.offset.toString());
  const qs = query.toString();
  return apiFetch<{
    data: {
      id: string;
      slug: string;
      name: string;
      description: string;
      logoUrl: string | null;
      category: string | null;
      tags: string[] | null;
      totalCalls: number;
      totalRevenue: string;
      publishedAt: string;
    }[];
    pagination: { limit: number; offset: number };
  }>(`/v1/apis${qs ? `?${qs}` : ""}`);
}

export async function getApiBySlug(slug: string) {
  return apiFetch<{
    id: string;
    slug: string;
    name: string;
    description: string;
    logoUrl: string | null;
    category: string | null;
    totalCalls: number;
    totalRevenue: string;
    endpoints: {
      path: string;
      method: string;
      description: string;
      pricePerCall: number;
    }[];
  }>(`/v1/apis/${slug}`);
}

// ============================================
// Fund API (Open Source Project Funding)
// ============================================

export async function listFundedRepos(params: {
  language?: string;
  sort?: "stars" | "funded" | "donors";
  q?: string;
  limit?: number;
  offset?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.language) query.set("language", params.language);
  if (params.sort) query.set("sort", params.sort);
  if (params.q) query.set("q", params.q);
  if (params.limit) query.set("limit", params.limit.toString());
  if (params.offset) query.set("offset", params.offset.toString());
  const qs = query.toString();
  return apiFetch<{
    data: any[];
    pagination: { limit: number; offset: number; total: number };
  }>(`/v1/fund/repos${qs ? `?${qs}` : ""}`);
}

export async function getFundedRepo(owner: string, name: string) {
  return apiFetch<any>(`/v1/fund/repos/${owner}/${name}`);
}

export async function getRepoDonors(
  owner: string,
  name: string,
  params: { limit?: number; offset?: number } = {}
) {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", params.limit.toString());
  if (params.offset) query.set("offset", params.offset.toString());
  const qs = query.toString();
  return apiFetch<{
    data: any[];
    pagination: { limit: number; offset: number; total: number };
  }>(`/v1/fund/repos/${owner}/${name}/donors${qs ? `?${qs}` : ""}`);
}

export async function getFundStats() {
  return apiFetch<{
    totalFunded: string;
    totalClaimed: string;
    repoCount: number;
    donorCount: number;
    donationCount: number;
  }>("/v1/fund/stats");
}

export async function recordDonation(
  token: string,
  data: {
    repoId: string;
    txHash: string;
    chainId: number;
    amount: string;
    redistributeOnTimeout?: boolean;
    source?: string;
  }
) {
  return apiFetch<any>("/v1/fund/donate", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify(data),
  });
}

export async function analyzeStack(
  token: string,
  data: { content: string; packageManager: string }
) {
  return apiFetch<{
    analysisId: string;
    dependencies: any[];
    scores: any[];
    unresolved: string[];
    totalDependencies: number;
    directDependencies: number;
  }>("/v1/fund/analyze", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify(data),
  });
}

export async function executeStackFunding(
  token: string,
  data: { analysisId: string; txHash: string; chainId: number; budget: string }
) {
  return apiFetch<any>("/v1/fund/distribute", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify(data),
  });
}

export async function getMyDonations(
  token: string,
  params: { limit?: number; offset?: number } = {}
) {
  const query = new URLSearchParams();
  if (params.limit) query.set("limit", params.limit.toString());
  if (params.offset) query.set("offset", params.offset.toString());
  const qs = query.toString();
  return apiFetch<{
    data: any[];
    pagination: { limit: number; offset: number; total: number };
  }>(`/v1/fund/my-donations${qs ? `?${qs}` : ""}`, {
    headers: withAuth(token),
  });
}

export async function requestRefund(
  token: string,
  data: { donationId: string; txHash: string }
) {
  return apiFetch<any>("/v1/fund/refund", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify(data),
  });
}

export async function getClaimAuthorization(
  token: string,
  data: { repoId: string; walletAddress: string },
  githubToken: string
) {
  return apiFetch<{
    repoHash: string;
    nonce: string;
    signature: string;
    escrowAddress: string;
    chainId: number;
  }>("/v1/fund/claim/authorize", {
    method: "POST",
    headers: {
      ...withAuth(token),
      "X-GitHub-Token": githubToken,
    },
    body: JSON.stringify(data),
  });
}

export async function confirmClaim(
  token: string,
  data: { repoId: string; txHash: string }
) {
  return apiFetch<any>("/v1/fund/claim/confirm", {
    method: "POST",
    headers: withAuth(token),
    body: JSON.stringify(data),
  });
}

export async function optOut(
  token: string,
  data: { owner: string; name: string },
  githubToken: string
) {
  return apiFetch<any>("/v1/fund/opt-out", {
    method: "POST",
    headers: {
      ...withAuth(token),
      "X-GitHub-Token": githubToken,
    },
    body: JSON.stringify(data),
  });
}

// ============================================
// Publisher GitHub Verification
// ============================================

export async function verifyPublisherGithub(
  token: string,
  githubToken: string
) {
  return apiFetch<{
    githubId: number;
    githubUsername: string;
    githubVerified: boolean;
    githubVerifiedAt: string;
  }>("/v1/publisher/verify-github", {
    method: "POST",
    headers: {
      ...withAuth(token),
      "X-GitHub-Token": githubToken,
    },
  });
}

export async function listPublisherGithubRepos(
  token: string,
  githubToken: string,
  page: number = 1
) {
  return apiFetch<
    {
      githubId: number;
      owner: string;
      name: string;
      fullName: string;
      description: string | null;
      language: string | null;
      stars: number;
    }[]
  >(`/v1/publisher/github-repos?page=${page}`, {
    headers: {
      ...withAuth(token),
      "X-GitHub-Token": githubToken,
    },
  });
}

export async function createPublisherApi(
  token: string,
  data: {
    name: string;
    slug: string;
    description?: string;
    baseUrl: string;
    category?: string;
    tags?: string[];
    documentationUrl?: string;
    logoUrl?: string;
    githubRepo?: string;
    endpoints?: {
      path: string;
      method: string;
      description?: string;
      pricePerCall: number;
      rateLimitPerMinute?: number;
    }[];
  },
  githubToken?: string
) {
  const headers: HeadersInit = withAuth(token);
  if (githubToken) {
    (headers as Record<string, string>)["X-GitHub-Token"] = githubToken;
  }
  return apiFetch<any>("/v1/publisher/apis", {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
}
