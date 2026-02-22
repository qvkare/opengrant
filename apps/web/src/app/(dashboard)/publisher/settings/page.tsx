"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatAddress } from "@/lib/utils";
import { verifyPublisherGithub } from "@/lib/api";
import { useApiAuth } from "@/hooks/useApiAuth";

export default function PublisherSettingsPage() {
  const { address } = useWallet();
  const walletAddress = address || "";
  const { token } = useApiAuth();

  const [profileName, setProfileName] = useState("My Project");
  const [website, setWebsite] = useState("https://example.com");
  const [twitter, setTwitter] = useState("@myproject");
  const [github, setGithub] = useState("myproject");
  const [isSaving, setIsSaving] = useState(false);

  // GitHub verification state
  const [githubPat, setGithubPat] = useState("");
  const [isVerifyingGithub, setIsVerifyingGithub] = useState(false);
  const [githubVerified, setGithubVerified] = useState(false);
  const [githubUsername, setGithubUsername] = useState<string | null>(null);
  const [githubError, setGithubError] = useState<string | null>(null);

  const handleVerifyGithub = useCallback(async () => {
    if (!token || !githubPat.trim()) return;
    setIsVerifyingGithub(true);
    setGithubError(null);
    try {
      const result = await verifyPublisherGithub(token, githubPat.trim());
      setGithubVerified(true);
      setGithubUsername(result.githubUsername);
      setGithubPat("");
    } catch (err: any) {
      setGithubError(err.message || "Verification failed");
    } finally {
      setIsVerifyingGithub(false);
    }
  }, [token, githubPat]);

  // Vault settings
  const [payees, setPayees] = useState([
    { address: walletAddress, share: 100 },
  ]);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
  };

  const addPayee = () => {
    setPayees([...payees, { address: "", share: 0 }]);
  };

  const removePayee = (index: number) => {
    if (payees.length > 1) {
      setPayees(payees.filter((_, i) => i !== index));
    }
  };

  const updatePayee = (index: number, field: "address" | "share", value: string | number) => {
    setPayees(
      payees.map((p, i) => (i === index ? { ...p, [field]: value } : p))
    );
  };

  const totalShares = payees.reduce((sum, p) => sum + p.share, 0);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your publisher profile and payment settings
        </p>
      </div>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Publisher Profile</CardTitle>
          <CardDescription>
            This information will be displayed on your public page
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Project Name</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-background border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Website</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              className="w-full mt-1 px-3 py-2 bg-background border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Twitter</label>
              <input
                type="text"
                value={twitter}
                onChange={(e) => setTwitter(e.target.value)}
                placeholder="@username"
                className="w-full mt-1 px-3 py-2 bg-background border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
            <div>
              <label className="text-sm font-medium">GitHub</label>
              <input
                type="text"
                value={github}
                onChange={(e) => setGithub(e.target.value)}
                placeholder="username/repo"
                className="w-full mt-1 px-3 py-2 bg-background border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          </div>

          <Button onClick={handleSaveProfile} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Profile"}
          </Button>
        </CardContent>
      </Card>

      {/* GitHub Verification */}
      <Card>
        <CardHeader>
          <CardTitle>GitHub Verification</CardTitle>
          <CardDescription>
            Verify your GitHub identity to link repos to your APIs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {githubVerified ? (
            <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
              <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-medium text-green-500">Verified as @{githubUsername}</p>
                <p className="text-sm text-muted-foreground">
                  Your GitHub identity has been verified. You can link repos when creating APIs.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium">GitHub Personal Access Token</label>
                <input
                  type="password"
                  value={githubPat}
                  onChange={(e) => setGithubPat(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  className="w-full mt-1 px-3 py-2 bg-background border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Create a token at GitHub Settings &gt; Developer settings &gt; Personal access tokens.
                  No special scopes needed for public repos.
                </p>
              </div>
              {githubError && (
                <p className="text-sm text-red-500">{githubError}</p>
              )}
              <Button
                onClick={handleVerifyGithub}
                disabled={isVerifyingGithub || !githubPat.trim()}
              >
                {isVerifyingGithub ? "Verifying..." : "Verify GitHub"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Wallet Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Wallet Address</CardTitle>
          <CardDescription>
            Your connected wallet for receiving payments
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="font-mono">{walletAddress}</p>
              <p className="text-xs text-muted-foreground mt-1">Base Network</p>
            </div>
            <Button variant="outline" size="sm">
              Change Wallet
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Revenue Split Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue Split</CardTitle>
          <CardDescription>
            Configure how your earnings are distributed (via PublisherVault)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {payees.map((payee, index) => (
              <div key={index} className="flex items-center gap-3">
                <input
                  type="text"
                  value={payee.address}
                  onChange={(e) => updatePayee(index, "address", e.target.value)}
                  placeholder="0x..."
                  className="flex-1 px-3 py-2 bg-background border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black font-mono text-sm"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={payee.share}
                    onChange={(e) =>
                      updatePayee(index, "share", parseInt(e.target.value) || 0)
                    }
                    className="w-20 px-3 py-2 bg-background border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black text-center"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                {payees.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removePayee(index)}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </Button>
                )}
              </div>
            ))}
          </div>

          <Button variant="outline" onClick={addPayee} className="w-full">
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
            Add Payee
          </Button>

          {totalShares !== 100 && (
            <p className="text-sm text-red-500">
              Total shares must equal 100% (currently {totalShares}%)
            </p>
          )}

          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <svg
                className="w-4 h-4 text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              How Revenue Split Works
            </h4>
            <p className="text-sm text-muted-foreground">
              Revenue is automatically distributed to the configured addresses
              based on their share percentages. This is managed by your
              PublisherVault smart contract on World Chain. Changes require an on-chain
              transaction.
            </p>
          </div>

          <Button disabled={totalShares !== 100}>
            Update Revenue Split
          </Button>
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Configure how you want to be notified
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Email Notifications</p>
              <p className="text-sm text-muted-foreground">
                Receive email alerts for important events
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Payment Alerts</p>
              <p className="text-sm text-muted-foreground">
                Get notified when you receive payments over $10
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Weekly Reports</p>
              <p className="text-sm text-muted-foreground">
                Receive weekly analytics summary
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-500/50">
        <CardHeader>
          <CardTitle className="text-red-500">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible and destructive actions
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Pause All APIs</p>
              <p className="text-sm text-muted-foreground">
                Temporarily disable all your APIs
              </p>
            </div>
            <Button variant="outline">Pause APIs</Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete Publisher Account</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete your publisher account and all APIs
              </p>
            </div>
            <Button variant="destructive">Delete Account</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
