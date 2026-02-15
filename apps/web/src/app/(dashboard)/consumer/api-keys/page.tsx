"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApiAuth } from "@/hooks/useApiAuth";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  isActive: boolean;
  allowedApis: string[] | null;
  expiresAt: string | null;
}

function CreateKeyModal({
  isOpen,
  onClose,
  onCreated,
  token,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (key: string) => void;
  token: string | null;
}) {
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!token) return;
    setIsCreating(true);
    try {
      const result = await createApiKey(token, { name });
      onCreated(result.key);
    } catch (err) {
      console.error("Failed to create API key:", err);
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <Card className="relative z-10 w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Create API Key</CardTitle>
          <CardDescription>
            Create a new API key for your application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Key Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production App"
              className="w-full mt-1 px-3 py-2 bg-background border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="text-xs text-muted-foreground mt-1">
              A friendly name to identify this key
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!name || isCreating}
              className="flex-1"
            >
              {isCreating ? "Creating..." : "Create Key"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KeyCreatedModal({
  isOpen,
  apiKey,
  onClose,
}: {
  isOpen: boolean;
  apiKey: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" />
      <Card className="relative z-10 w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-green-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            API Key Created
          </CardTitle>
          <CardDescription>
            Make sure to copy your API key now. You won't be able to see it again!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-3 rounded-lg">
            <p className="font-mono text-sm break-all">{apiKey}</p>
          </div>

          <Button onClick={handleCopy} variant="outline" className="w-full">
            {copied ? (
              <>
                <svg
                  className="w-4 h-4 mr-2 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Copied!
              </>
            ) : (
              <>
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
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
                Copy to Clipboard
              </>
            )}
          </Button>

          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function ConsumerAPIKeysPage() {
  const { token } = useApiAuth("consumer");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreatedModal, setShowCreatedModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [keys, setKeys] = useState<ApiKey[]>([]);

  const fetchKeys = useCallback(async () => {
    if (!token) return;
    try {
      const data = await listApiKeys(token);
      setKeys(data);
    } catch (err) {
      console.error("Failed to fetch keys:", err);
    }
  }, [token]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const handleKeyCreated = (key: string) => {
    setNewApiKey(key);
    setShowCreateModal(false);
    setShowCreatedModal(true);
    fetchKeys();
  };

  const handleRevoke = async (keyId: string) => {
    if (!token) return;
    try {
      await revokeApiKey(token, keyId);
      fetchKeys();
    } catch (err) {
      console.error("Failed to revoke key:", err);
    }
  };

  const activeKeys = keys.filter((k) => k.isActive);
  const revokedKeys = keys.filter((k) => !k.isActive);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">API Keys</h1>
          <p className="text-muted-foreground">
            Manage your API keys for authenticating requests
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
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
          Create New Key
        </Button>
      </div>

      {/* Active Keys */}
      <Card>
        <CardHeader>
          <CardTitle>Active Keys</CardTitle>
          <CardDescription>
            Keys that are currently active and can be used for API requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeKeys.length > 0 ? (
            <div className="space-y-4">
              {activeKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-black"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">{key.name}</p>
                      <p className="text-sm text-muted-foreground font-mono">
                        {key.prefix}••••••••
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">
                        Created: {new Date(key.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-500 hover:text-red-600"
                      onClick={() => handleRevoke(key.id)}
                    >
                      Revoke
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
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
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium">No API keys</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Create your first API key to start using OpenGrant APIs.
              </p>
              <Button className="mt-4" onClick={() => setShowCreateModal(true)}>
                Create API Key
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Guide */}
      <Card>
        <CardHeader>
          <CardTitle>How to Use Your API Key</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Using the SDK</h4>
            <div className="bg-muted p-3 rounded-lg overflow-x-auto">
              <pre className="text-sm font-mono">
{`import { OpenGrant } from '@opengrant/sdk';

const client = new OpenGrant({
  apiKey: 'og_live_your_api_key'
});

const response = await client.call('tailwind', '/v1/generate', {
  input: 'Your input here'
});`}
              </pre>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">Using HTTP directly</h4>
            <div className="bg-muted p-3 rounded-lg overflow-x-auto">
              <pre className="text-sm font-mono">
{`curl -X POST https://api.opengrant.dev/proxy/tailwind/v1/generate \\
  -H "Authorization: Bearer og_live_your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{"input": "Your input here"}'`}
              </pre>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Revoked Keys */}
      {revokedKeys.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Revoked Keys</CardTitle>
            <CardDescription>
              Keys that have been revoked and can no longer be used
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {revokedKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between p-4 border rounded-lg opacity-60"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium">{key.name}</p>
                      <p className="text-sm text-muted-foreground font-mono">
                        {key.prefix}••••••••
                      </p>
                    </div>
                  </div>
                  <span className="text-sm text-red-500">Revoked</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modals */}
      <CreateKeyModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={handleKeyCreated}
        token={token}
      />
      <KeyCreatedModal
        isOpen={showCreatedModal}
        apiKey={newApiKey}
        onClose={() => setShowCreatedModal(false)}
      />
    </div>
  );
}
