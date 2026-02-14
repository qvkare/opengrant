"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApiAuth } from "@/hooks/useApiAuth";
import { registerApi, addEndpoint as createEndpoint, listPublisherGithubRepos, createPublisherApi } from "@/lib/api";

interface Endpoint {
  id: string;
  path: string;
  method: string;
  description: string;
  pricePerCall: string;
  rateLimitPerMinute: string;
}

export default function RegisterAPIPage() {
  const router = useRouter();
  const { token } = useApiAuth("publisher");
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [endpoints, setEndpoints] = useState<Endpoint[]>([
    {
      id: "1",
      path: "",
      method: "GET",
      description: "",
      pricePerCall: "0.001",
      rateLimitPerMinute: "60",
    },
  ]);

  // GitHub repo linking
  const [githubRepo, setGithubRepo] = useState("");
  const [githubPat, setGithubPat] = useState("");
  const [githubRepos, setGithubRepos] = useState<{ fullName: string; description: string | null }[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);

  const loadGithubRepos = async () => {
    if (!token || !githubPat) return;
    setLoadingRepos(true);
    try {
      const repos = await listPublisherGithubRepos(token, githubPat);
      setGithubRepos(repos.map(r => ({ fullName: r.fullName, description: r.description })));
    } catch {
      setGithubRepos([]);
    } finally {
      setLoadingRepos(false);
    }
  };

  const addEndpoint = () => {
    setEndpoints([
      ...endpoints,
      {
        id: Date.now().toString(),
        path: "",
        method: "GET",
        description: "",
        pricePerCall: "0.001",
        rateLimitPerMinute: "60",
      },
    ]);
  };

  const removeEndpoint = (id: string) => {
    if (endpoints.length > 1) {
      setEndpoints(endpoints.filter((e) => e.id !== id));
    }
  };

  const updateEndpoint = (id: string, field: keyof Endpoint, value: string) => {
    setEndpoints(
      endpoints.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const handleSubmit = async () => {
    if (!token) return;
    setIsSubmitting(true);
    setError(null);

    try {
      if (githubRepo) {
        // Use createPublisherApi with GitHub repo linking
        await createPublisherApi(
          token,
          {
            name,
            slug,
            description: description || undefined,
            baseUrl,
            githubRepo,
            endpoints: endpoints.map((ep) => ({
              path: ep.path,
              method: ep.method,
              description: ep.description || undefined,
              pricePerCall: Math.round(parseFloat(ep.pricePerCall) * 1_000_000),
              rateLimitPerMinute: parseInt(ep.rateLimitPerMinute),
            })),
          },
          githubPat || undefined
        );
      } else {
        // 1. Create the API
        const api = await registerApi(token, {
          name,
          slug,
          description: description || undefined,
          baseUrl,
        });

        // 2. Add endpoints
        for (const ep of endpoints) {
          await createEndpoint(token, api.id, {
            path: ep.path,
            method: ep.method,
            description: ep.description || undefined,
            pricePerCall: Math.round(parseFloat(ep.pricePerCall) * 1_000_000),
            rateLimitPerMinute: parseInt(ep.rateLimitPerMinute),
          });
        }
      }

      router.push("/publisher/apis");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Register New API</h1>
        <p className="text-muted-foreground">
          Add your API to OpenGrant and start earning
        </p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {[
          { num: 1, label: "Basic Info" },
          { num: 2, label: "Endpoints" },
          { num: 3, label: "Review" },
        ].map((s, index) => (
          <div key={s.num} className="flex items-center">
            <div
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium",
                step >= s.num
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {s.num}
            </div>
            <span
              className={cn(
                "ml-2 text-sm",
                step >= s.num ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {s.label}
            </span>
            {index < 2 && (
              <div
                className={cn(
                  "w-16 h-0.5 mx-4",
                  step > s.num ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Basic Info */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Tell us about your API
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">API Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slug) {
                    setSlug(generateSlug(e.target.value));
                  }
                }}
                placeholder="My Awesome API"
                className="w-full mt-1 px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div>
              <label className="text-sm font-medium">URL Slug</label>
              <div className="flex items-center mt-1">
                <span className="text-muted-foreground text-sm mr-1">
                  opengrant.dev/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="my-api"
                  className="flex-1 px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                This will be your public URL for donations and API access
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what your API does..."
                rows={3}
                className="w-full mt-1 px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Base URL</label>
              <input
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.example.com"
                className="w-full mt-1 px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The base URL where your API is hosted. We'll proxy requests to this URL.
              </p>
            </div>

            {/* GitHub Repo Link (optional) */}
            <div className="border-t pt-4">
              <label className="text-sm font-medium">Link GitHub Repository (optional)</label>
              <p className="text-xs text-muted-foreground mb-2">
                Verify ownership and link this API to a GitHub repository
              </p>
              <div className="space-y-2">
                <input
                  type="password"
                  value={githubPat}
                  onChange={(e) => setGithubPat(e.target.value)}
                  placeholder="GitHub PAT (ghp_...)"
                  className="w-full px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={loadGithubRepos}
                    disabled={!githubPat || loadingRepos}
                  >
                    {loadingRepos ? "Loading..." : "Load Repos"}
                  </Button>
                  {githubRepos.length > 0 && (
                    <select
                      value={githubRepo}
                      onChange={(e) => setGithubRepo(e.target.value)}
                      className="flex-1 px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-sm"
                    >
                      <option value="">None</option>
                      {githubRepos.map((r) => (
                        <option key={r.fullName} value={r.fullName}>
                          {r.fullName}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {githubRepo && (
                  <p className="text-xs text-green-500">
                    Will link to: {githubRepo}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button
                onClick={() => setStep(2)}
                disabled={!name || !slug || !baseUrl}
              >
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Endpoints */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Configure Endpoints</CardTitle>
            <CardDescription>
              Define the endpoints you want to monetize
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {endpoints.map((endpoint, index) => (
              <div
                key={endpoint.id}
                className="p-4 border rounded-lg space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Endpoint {index + 1}</h4>
                  {endpoints.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEndpoint(endpoint.id)}
                    >
                      Remove
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="text-sm font-medium">Method</label>
                    <select
                      value={endpoint.method}
                      onChange={(e) =>
                        updateEndpoint(endpoint.id, "method", e.target.value)
                      }
                      className="w-full mt-1 px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                      <option value="PUT">PUT</option>
                      <option value="DELETE">DELETE</option>
                      <option value="PATCH">PATCH</option>
                    </select>
                  </div>
                  <div className="col-span-3">
                    <label className="text-sm font-medium">Path</label>
                    <input
                      type="text"
                      value={endpoint.path}
                      onChange={(e) =>
                        updateEndpoint(endpoint.id, "path", e.target.value)
                      }
                      placeholder="/v1/endpoint"
                      className="w-full mt-1 px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium">Description</label>
                  <input
                    type="text"
                    value={endpoint.description}
                    onChange={(e) =>
                      updateEndpoint(endpoint.id, "description", e.target.value)
                    }
                    placeholder="What does this endpoint do?"
                    className="w-full mt-1 px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">
                      Price per Call (USDC)
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={endpoint.pricePerCall}
                      onChange={(e) =>
                        updateEndpoint(endpoint.id, "pricePerCall", e.target.value)
                      }
                      className="w-full mt-1 px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      Rate Limit (per minute)
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={endpoint.rateLimitPerMinute}
                      onChange={(e) =>
                        updateEndpoint(
                          endpoint.id,
                          "rateLimitPerMinute",
                          e.target.value
                        )
                      }
                      className="w-full mt-1 px-3 py-2 bg-background border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button variant="outline" onClick={addEndpoint} className="w-full">
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
              Add Another Endpoint
            </Button>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={endpoints.some((e) => !e.path)}
              >
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Submit</CardTitle>
            <CardDescription>
              Review your API configuration before submitting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground">API Name</label>
                <p className="font-medium">{name}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Public URL</label>
                <p className="font-mono">opengrant.dev/{slug}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Base URL</label>
                <p className="font-mono">{baseUrl}</p>
              </div>
              <div>
                <label className="text-sm text-muted-foreground">Description</label>
                <p>{description || "-"}</p>
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                Endpoints ({endpoints.length})
              </label>
              <div className="space-y-2">
                {endpoints.map((endpoint) => (
                  <div
                    key={endpoint.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-xs font-mono font-medium",
                          endpoint.method === "GET"
                            ? "bg-blue-500/10 text-blue-500"
                            : "bg-green-500/10 text-green-500"
                        )}
                      >
                        {endpoint.method}
                      </span>
                      <span className="font-mono text-sm">{endpoint.path}</span>
                    </div>
                    <span className="text-sm">
                      ${endpoint.pricePerCall}/call
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-medium mb-2">Platform Fee</h4>
              <p className="text-sm text-muted-foreground">
                OpenGrant charges a 2.5% platform fee on all transactions. You'll
                receive 97.5% of all payments.
              </p>
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-500">
                {error}
              </div>
            )}

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting || !token}>
                {isSubmitting ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Registering...
                  </>
                ) : (
                  "Register API"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
