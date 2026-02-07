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
