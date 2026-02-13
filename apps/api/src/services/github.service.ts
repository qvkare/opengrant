import { keccak256, encodePacked } from "viem";
import { eq, and, desc, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { githubRepos, type GithubRepo } from "@opengrant/database";

const GITHUB_API = "https://api.github.com";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 10_000; // 10 seconds

function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeout));
}

export interface GitHubUser {
  id: number;
  login: string;
  avatar_url: string;
  name: string | null;
  bio: string | null;
}

export interface GitHubUserRepo {
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  language: string | null;
  stars: number;
}

interface GitHubApiRepo {
  id: number;
  owner: { login: string; avatar_url: string };
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  homepage: string | null;
  topics: string[];
  license: { spdx_id: string } | null;
}

export interface SearchParams {
  language?: string;
  sort?: "stars" | "funded" | "donors";
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * Compute a deterministic repo hash from GitHub ID
 * Must match the contract: keccak256(abi.encodePacked(uint256(githubId)))
 */
export function computeRepoHash(githubId: number): `0x${string}` {
  return keccak256(encodePacked(["uint256"], [BigInt(githubId)]));
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "OpenGrant-API",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function mapApiRepo(repo: GitHubApiRepo) {
  return {
    githubId: repo.id,
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    repoHash: computeRepoHash(repo.id),
    description: repo.description,
    language: repo.language,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    avatarUrl: repo.owner.avatar_url,
    homepageUrl: repo.homepage,
    topics: repo.topics || [],
    license: repo.license?.spdx_id || null,
    lastSyncedAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Sync top GitHub repos by stars into the database
 */
export async function syncTopRepos(limit: number = 500): Promise<number> {
  let synced = 0;
  const perPage = 100;
  const pages = Math.ceil(limit / perPage);

  for (let page = 1; page <= pages; page++) {
    const remaining = limit - synced;
    const count = Math.min(perPage, remaining);

    const res = await fetchWithTimeout(
      `${GITHUB_API}/search/repositories?q=stars:>1000&sort=stars&order=desc&per_page=${count}&page=${page}`,
      { headers: githubHeaders() }
    );

    if (!res.ok) {
      console.error(`GitHub API error: ${res.status} ${res.statusText}`);
      break;
    }

    const data = await res.json();
    const items: GitHubApiRepo[] = data.items || [];

    for (const repo of items) {
      const mapped = mapApiRepo(repo);
      await db
        .insert(githubRepos)
        .values({
          ...mapped,
          createdAt: new Date(),
        })
        .onConflictDoUpdate({
          target: githubRepos.githubId,
          set: mapped,
        });
      synced++;
    }

    if (items.length < count) break;
  }

  return synced;
}

/**
 * Get a repo by owner/name, with DB caching
 */
export async function getRepoByOwnerName(
  owner: string,
  name: string
): Promise<GithubRepo | null> {
  // Check DB cache first
  const cached = await db.query.githubRepos.findFirst({
    where: and(
      eq(githubRepos.owner, owner),
      eq(githubRepos.name, name)
    ),
  });

  if (cached && cached.lastSyncedAt) {
    const age = Date.now() - cached.lastSyncedAt.getTime();
    if (age < CACHE_TTL_MS) {
      return cached;
    }
  }

  // Fetch from GitHub
  const res = await fetchWithTimeout(`${GITHUB_API}/repos/${owner}/${name}`, {
    headers: githubHeaders(),
  });

  if (!res.ok) {
    return cached || null;
  }

  const repo: GitHubApiRepo = await res.json();
  const mapped = mapApiRepo(repo);

  const [upserted] = await db
    .insert(githubRepos)
    .values({
      ...mapped,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: githubRepos.githubId,
      set: mapped,
    })
    .returning();

  return upserted;
}

/**
 * Search repos in the database
 */
export async function searchRepos(params: SearchParams) {
  const limit = Math.min(Math.max(params.limit || 20, 1), 100);
  const offset = Math.max(params.offset || 0, 0);

  const conditions = [];
  if (params.language) {
    conditions.push(eq(githubRepos.language, params.language));
  }
  if (params.q) {
    // Escape SQL LIKE wildcard characters to prevent wildcard injection
    const escapedQ = params.q.replace(/[%_\\]/g, "\\$&");
    conditions.push(
      or(
        ilike(githubRepos.fullName, `%${escapedQ}%`),
        ilike(githubRepos.description, `%${escapedQ}%`)
      )
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  let orderBy;
  switch (params.sort) {
    case "funded":
      orderBy = desc(githubRepos.totalFunded);
      break;
    case "donors":
      orderBy = desc(githubRepos.donorCount);
      break;
    case "stars":
    default:
      orderBy = desc(githubRepos.stars);
      break;
  }

  const [data, countResult] = await Promise.all([
    db.query.githubRepos.findMany({
      where,
      orderBy: () => [orderBy],
      limit,
      offset,
    }),
    db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(githubRepos)
      .where(where),
  ]);

  return {
    data,
    pagination: {
      limit,
      offset,
      total: countResult[0]?.count || 0,
    },
  };
}

/**
 * Verify that a GitHub user has admin access to a repo
 */
export async function verifyRepoOwnership(
  githubAccessToken: string,
  githubId: number
): Promise<boolean> {
  const res = await fetchWithTimeout(`${GITHUB_API}/repositories/${githubId}`, {
    headers: {
      Authorization: `Bearer ${githubAccessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "OpenGrant-API",
    },
  });

  if (!res.ok) return false;

  const repo = await res.json();
  return repo.permissions?.admin === true;
}

/**
 * Check FUNDING.yml for an opengrant wallet address
 */
export async function checkFundingYml(
  owner: string,
  name: string
): Promise<string | null> {
  const res = await fetchWithTimeout(
    `${GITHUB_API}/repos/${owner}/${name}/contents/.github/FUNDING.yml`,
    { headers: githubHeaders() }
  );

  if (!res.ok) return null;

  const data = await res.json();
  if (!data.content) return null;

  const content = Buffer.from(data.content, "base64").toString("utf-8");
  // Look for opengrant: 0x... pattern
  const match = content.match(/opengrant:\s*(0x[a-fA-F0-9]{40})/);
  return match ? match[1] : null;
}

/**
 * Resolve npm package name to GitHub repo info
 */
export async function resolveNpmToGithub(
  packageName: string
): Promise<{ owner: string; repo: string; githubId: number } | null> {
  try {
    const res = await fetchWithTimeout(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
    if (!res.ok) return null;

    const data = await res.json();
    const repoUrl = data.repository?.url || "";
    const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
    if (!match) return null;

    const [, owner, repo] = match;
    // Get GitHub ID
    const ghRes = await fetchWithTimeout(`${GITHUB_API}/repos/${owner}/${repo}`, {
      headers: githubHeaders(),
    });
    if (!ghRes.ok) return null;

    const ghData = await ghRes.json();
    return { owner, repo, githubId: ghData.id };
  } catch {
    return null;
  }
}

/**
 * Resolve Rust crate to GitHub repo info
 */
export async function resolveCrateToGithub(
  crateName: string
): Promise<{ owner: string; repo: string; githubId: number } | null> {
  try {
    const res = await fetchWithTimeout(`https://crates.io/api/v1/crates/${encodeURIComponent(crateName)}`);
    if (!res.ok) return null;

    const data = await res.json();
    const repoUrl = data.crate?.repository || "";
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/.]+)/);
    if (!match) return null;

    const [, owner, repo] = match;
    const ghRes = await fetchWithTimeout(`${GITHUB_API}/repos/${owner}/${repo}`, {
      headers: githubHeaders(),
    });
    if (!ghRes.ok) return null;

    const ghData = await ghRes.json();
    return { owner, repo, githubId: ghData.id };
  } catch {
    return null;
  }
}

/**
 * Get the authenticated GitHub user from a personal access token
 */
export async function getAuthenticatedUser(
  githubAccessToken: string
): Promise<GitHubUser | null> {
  try {
    const res = await fetchWithTimeout(`${GITHUB_API}/user`, {
      headers: {
        Authorization: `Bearer ${githubAccessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "OpenGrant-API",
      },
    });

    if (!res.ok) return null;

    const data = await res.json();
    return {
      id: data.id,
      login: data.login,
      avatar_url: data.avatar_url,
      name: data.name,
      bio: data.bio,
    };
  } catch {
    return null;
  }
}

/**
 * List repos where the authenticated user has admin access
 */
export async function listUserRepos(
  githubAccessToken: string,
  page: number = 1
): Promise<GitHubUserRepo[]> {
  try {
    const res = await fetchWithTimeout(
      `${GITHUB_API}/user/repos?type=owner&sort=updated&per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${githubAccessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "OpenGrant-API",
        },
      }
    );

    if (!res.ok) return [];

    const repos: any[] = await res.json();
    return repos
      .filter((r) => r.permissions?.admin === true)
      .map((r) => ({
        githubId: r.id,
        owner: r.owner.login,
        name: r.name,
        fullName: r.full_name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
      }));
  } catch {
    return [];
  }
}

/**
 * Resolve Go module path to GitHub repo info
 */
export async function resolveGoModToGithub(
  modulePath: string
): Promise<{ owner: string; repo: string; githubId: number } | null> {
  try {
    // Go module paths like github.com/owner/repo
    const match = modulePath.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;

    const [, owner, repo] = match;
    const ghRes = await fetchWithTimeout(`${GITHUB_API}/repos/${owner}/${repo}`, {
      headers: githubHeaders(),
    });
    if (!ghRes.ok) return null;

    const ghData = await ghRes.json();
    return { owner, repo, githubId: ghData.id };
  } catch {
    return null;
  }
}
