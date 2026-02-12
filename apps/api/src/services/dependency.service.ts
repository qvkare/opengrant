import {
  resolveNpmToGithub,
  resolveCrateToGithub,
  resolveGoModToGithub,
  computeRepoHash,
} from "./github.service.js";

export interface ResolvedDep {
  name: string;
  owner: string;
  repo: string;
  githubId: number;
  repoHash: `0x${string}`;
  isDirect: boolean;
  stars?: number;
}

export interface ScoredDep extends ResolvedDep {
  score: number;
}

export interface Distribution {
  repoHash: `0x${string}`;
  githubId: number;
  name: string;
  owner: string;
  repo: string;
  amount: number;
  score: number;
}

export interface AnalysisResult {
  dependencies: ResolvedDep[];
  unresolved: string[];
  totalDependencies: number;
  directDependencies: number;
}

/**
 * Analyze a package.json file and resolve dependencies to GitHub repos
 */
export async function analyzePackageJson(content: string): Promise<AnalysisResult> {
  const pkg = JSON.parse(content);
  const deps = Object.keys(pkg.dependencies || {});
  const devDeps = Object.keys(pkg.devDependencies || {});
  const allDeps = [...new Set([...deps, ...devDeps])];

  const resolved: ResolvedDep[] = [];
  const unresolved: string[] = [];

  // Resolve in batches of 10 to avoid overwhelming APIs
  for (let i = 0; i < allDeps.length; i += 10) {
    const batch = allDeps.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (name) => {
        const info = await resolveNpmToGithub(name);
        if (!info) throw new Error(`Unresolved: ${name}`);
        return {
          name,
          ...info,
          repoHash: computeRepoHash(info.githubId),
          isDirect: deps.includes(name),
        };
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        resolved.push(result.value);
      } else {
        unresolved.push(batch[j]);
      }
    }
  }

  return {
    dependencies: deduplicateByGithubId(resolved),
    unresolved,
    totalDependencies: allDeps.length,
    directDependencies: deps.length,
  };
}

/**
 * Analyze a Cargo.toml file
 */
export async function analyzeCargoToml(content: string): Promise<AnalysisResult> {
  // Simple TOML parsing for [dependencies] section
  const depLines = extractTomlDependencies(content);

  const resolved: ResolvedDep[] = [];
  const unresolved: string[] = [];

  for (let i = 0; i < depLines.length; i += 10) {
    const batch = depLines.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (name) => {
        const info = await resolveCrateToGithub(name);
        if (!info) throw new Error(`Unresolved: ${name}`);
        return {
          name,
          ...info,
          repoHash: computeRepoHash(info.githubId),
          isDirect: true,
        };
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        resolved.push(result.value);
      } else {
        unresolved.push(batch[j]);
      }
    }
  }

  return {
    dependencies: deduplicateByGithubId(resolved),
    unresolved,
    totalDependencies: depLines.length,
    directDependencies: depLines.length,
  };
}

/**
 * Analyze a go.mod file
 */
export async function analyzeGoMod(content: string): Promise<AnalysisResult> {
  const modules = extractGoModDependencies(content);

  const resolved: ResolvedDep[] = [];
  const unresolved: string[] = [];

  for (let i = 0; i < modules.length; i += 10) {
    const batch = modules.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map(async (modPath) => {
        const info = await resolveGoModToGithub(modPath);
        if (!info) throw new Error(`Unresolved: ${modPath}`);
        return {
          name: modPath,
          ...info,
          repoHash: computeRepoHash(info.githubId),
          isDirect: true,
        };
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === "fulfilled") {
        resolved.push(result.value);
      } else {
        unresolved.push(batch[j]);
      }
    }
  }

  return {
    dependencies: deduplicateByGithubId(resolved),
    unresolved,
    totalDependencies: modules.length,
    directDependencies: modules.length,
  };
}

/**
 * Score dependencies based on directness and stars
 */
export function scoreDependencies(deps: ResolvedDep[]): ScoredDep[] {
  if (deps.length === 0) return [];

  const scored = deps.map((dep) => {
    const directWeight = dep.isDirect ? 1.0 : 0.3;
    const starFactor = Math.log((dep.stars || 1) + 1);
    const rawScore = directWeight * starFactor;
    return { ...dep, score: rawScore };
  });

  // Normalize to sum = 1.0
  const totalScore = scored.reduce((sum, d) => sum + d.score, 0);
  if (totalScore === 0) {
    // Equal distribution
    const equalScore = 1.0 / scored.length;
    return scored.map((d) => ({ ...d, score: equalScore }));
  }

  return scored.map((d) => ({
    ...d,
    score: d.score / totalScore,
  }));
}

/**
 * Compute final distribution of a budget across scored dependencies
 * Filters out amounts below 1 USDC minimum and redistributes remainder
 */
export function computeDistribution(
  scores: ScoredDep[],
  budget: number
): Distribution[] {
  if (scores.length === 0 || budget <= 0) return [];

  const MIN_AMOUNT = 1; // 1 USDC minimum

  // First pass: compute raw amounts
  let remaining = budget;
  const distributions: Distribution[] = [];
  const eligible = scores.filter((s) => s.score * budget >= MIN_AMOUNT);

  if (eligible.length === 0) {
    // Budget too small for multiple, give all to highest scored
    const top = scores.reduce((a, b) => (a.score > b.score ? a : b));
    return [
      {
        repoHash: top.repoHash,
        githubId: top.githubId,
        name: top.name,
        owner: top.owner,
        repo: top.repo,
        amount: budget,
        score: 1,
      },
    ];
  }

  // Renormalize eligible scores
  const eligibleTotal = eligible.reduce((sum, d) => sum + d.score, 0);

  for (const dep of eligible) {
    const normalizedScore = dep.score / eligibleTotal;
    const amount = Math.floor(normalizedScore * budget * 1e6) / 1e6; // 6 decimal precision
    if (amount >= MIN_AMOUNT) {
      distributions.push({
        repoHash: dep.repoHash,
        githubId: dep.githubId,
        name: dep.name,
        owner: dep.owner,
        repo: dep.repo,
        amount,
        score: normalizedScore,
      });
      remaining -= amount;
    }
  }

  // Give remainder to top project
  if (remaining > 0 && distributions.length > 0) {
    distributions[0].amount =
      Math.round((distributions[0].amount + remaining) * 1e6) / 1e6;
  }

  return distributions;
}

// ============================================
// HELPERS
// ============================================

function extractTomlDependencies(content: string): string[] {
  const deps: string[] = [];
  let inDeps = false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "[dependencies]" || trimmed === "[dev-dependencies]") {
      inDeps = true;
      continue;
    }
    if (trimmed.startsWith("[") && inDeps) {
      inDeps = false;
      continue;
    }
    if (inDeps && trimmed && !trimmed.startsWith("#")) {
      const name = trimmed.split("=")[0].trim();
      if (name) deps.push(name);
    }
  }

  return [...new Set(deps)];
}

function extractGoModDependencies(content: string): string[] {
  const modules: string[] = [];
  let inRequire = false;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("require (")) {
      inRequire = true;
      continue;
    }
    if (trimmed === ")" && inRequire) {
      inRequire = false;
      continue;
    }
    if (trimmed.startsWith("require ") && !trimmed.includes("(")) {
      // Single-line require
      const modPath = trimmed.replace("require ", "").split(" ")[0];
      if (modPath.includes("github.com")) modules.push(modPath);
      continue;
    }
    if (inRequire && trimmed && !trimmed.startsWith("//")) {
      const modPath = trimmed.split(" ")[0];
      if (modPath.includes("github.com")) modules.push(modPath);
    }
  }

  return [...new Set(modules)];
}

function deduplicateByGithubId(deps: ResolvedDep[]): ResolvedDep[] {
  const seen = new Map<number, ResolvedDep>();
  for (const dep of deps) {
    const existing = seen.get(dep.githubId);
    if (!existing || (dep.isDirect && !existing.isDirect)) {
      seen.set(dep.githubId, dep);
    }
  }
  return Array.from(seen.values());
}
