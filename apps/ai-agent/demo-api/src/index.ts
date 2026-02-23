/**
 * Demo Publisher API — Code Scanner
 *
 * A simple API that the AI Agent demo calls via OpenGrant SDK (x402 payments).
 * Provides code analysis and best-practice suggestions.
 *
 * Endpoints:
 *   GET  /health           → health check
 *   POST /v1/analyze-code  → static code analysis
 *   GET  /v1/suggestions   → language-specific best practices
 */

import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 4000;

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "code-scanner", version: "1.0.0" });
});

// Code analysis endpoint
app.post("/v1/analyze-code", (req, res) => {
  const { code, language } = req.body;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "code field required (string)" });
  }

  const lang = language || "typescript";
  const lines = code.split("\n");
  const lineCount = lines.length;

  // Simple static analysis
  const issues: Array<{ line: number; severity: string; message: string }> = [];

  lines.forEach((line, i) => {
    const lineNum = i + 1;

    // Check for 'any' type usage (TypeScript)
    if (lang === "typescript" && /:\s*any\b/.test(line)) {
      issues.push({
        line: lineNum,
        severity: "warning",
        message: "Avoid using 'any' type — use a specific type instead",
      });
    }

    // Check for TODO/FIXME comments
    if (/\/\/\s*(TODO|FIXME|HACK|XXX)/i.test(line)) {
      issues.push({
        line: lineNum,
        severity: "info",
        message: "Unresolved TODO/FIXME comment found",
      });
    }

    // Check for console.log in production code
    if (/console\.(log|debug|info)\(/.test(line)) {
      issues.push({
        line: lineNum,
        severity: "warning",
        message: "Remove console.log before production",
      });
    }

    // Check for very long lines
    if (line.length > 120) {
      issues.push({
        line: lineNum,
        severity: "info",
        message: `Line exceeds 120 characters (${line.length})`,
      });
    }

    // Check for == instead of ===
    if (/[^=!]==[^=]/.test(line)) {
      issues.push({
        line: lineNum,
        severity: "warning",
        message: "Use strict equality (===) instead of loose equality (==)",
      });
    }
  });

  const score = Math.max(0, 100 - issues.length * 5);

  res.json({
    language: lang,
    lineCount,
    issueCount: issues.length,
    score,
    grade: score >= 90 ? "A" : score >= 70 ? "B" : score >= 50 ? "C" : "D",
    issues,
    analyzedAt: new Date().toISOString(),
  });
});

// Best practice suggestions
app.get("/v1/suggestions", (req, res) => {
  const language = (req.query.language as string) || "typescript";

  const suggestions: Record<string, string[]> = {
    typescript: [
      "Enable strict mode in tsconfig.json",
      "Use 'unknown' instead of 'any' for truly unknown types",
      "Prefer 'const' over 'let' when variables are not reassigned",
      "Use discriminated unions for complex state management",
      "Enable 'noUncheckedIndexedAccess' for safer array access",
    ],
    javascript: [
      "Use 'const' and 'let' instead of 'var'",
      "Enable strict mode with 'use strict'",
      "Use optional chaining (?.) for safe property access",
      "Prefer template literals over string concatenation",
      "Use Array.prototype methods (map, filter, reduce) over loops",
    ],
    python: [
      "Use type hints for function parameters and return values",
      "Prefer f-strings over .format() or % formatting",
      "Use dataclasses or Pydantic for data structures",
      "Run mypy for static type checking",
      "Use pathlib.Path instead of os.path for file operations",
    ],
    rust: [
      "Use clippy for additional lint checks",
      "Prefer &str over String for function parameters",
      "Use Result<T, E> for error handling instead of unwrap()",
      "Derive common traits (Debug, Clone, PartialEq) on structs",
      "Use iterators instead of manual indexing",
    ],
  };

  const tips = suggestions[language] || suggestions.typescript;

  res.json({
    language,
    suggestions: tips,
    count: tips.length,
  });
});

app.listen(PORT, () => {
  console.log(`Demo Code Scanner API running on http://localhost:${PORT}`);
  console.log("Endpoints:");
  console.log("  GET  /health");
  console.log("  POST /v1/analyze-code");
  console.log("  GET  /v1/suggestions");
});
