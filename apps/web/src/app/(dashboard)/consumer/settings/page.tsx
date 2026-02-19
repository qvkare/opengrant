"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/contexts/wallet-context";
import { useApiAuth } from "@/hooks/useApiAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getConsumerProfile, updateConsumerSettings } from "@/lib/api";

const TIP_PRESETS = [1, 3, 5, 10];

export default function ConsumerSettingsPage() {
  const { address } = useWallet();
  const { token } = useApiAuth();
  const walletAddress = address || "";

  const [spendingLimit, setSpendingLimit] = useState("100");
  const [isSaving, setIsSaving] = useState(false);

  // OSS Tip settings
  const [ossTipEnabled, setOssTipEnabled] = useState(false);
  const [ossTipPercentage, setOssTipPercentage] = useState(5);
  const [isSavingTip, setIsSavingTip] = useState(false);
  const [tipSaveMessage, setTipSaveMessage] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Load current settings from backend
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    async function loadSettings() {
      try {
        const profile = await getConsumerProfile(token!);
        if (cancelled) return;
        const s = profile.settings || {};
        setOssTipEnabled(s.ossTipEnabled ?? false);
        setOssTipPercentage(s.ossTipPercentage ?? 5);
        setSettingsLoaded(true);
      } catch {
        // Settings not available yet
      }
    }
    loadSettings();

    return () => { cancelled = true; };
  }, [token]);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsSaving(false);
  };

  const handleSaveTipSettings = useCallback(async () => {
    if (!token) return;
    setIsSavingTip(true);
    setTipSaveMessage(null);
    try {
      const profile = await getConsumerProfile(token);
      const currentSettings = profile.settings || {};
      await updateConsumerSettings(token, {
        ...currentSettings,
        ossTipEnabled,
        ossTipPercentage,
      });
      setTipSaveMessage("Settings saved!");
      setTimeout(() => setTipSaveMessage(null), 3000);
    } catch {
      setTipSaveMessage("Failed to save settings");
    } finally {
      setIsSavingTip(false);
    }
  }, [token, ossTipEnabled, ossTipPercentage]);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your consumer account settings
        </p>
      </div>

      {/* Wallet Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Wallet</CardTitle>
          <CardDescription>
            Your connected wallet for API payments
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

      {/* Support Open Source */}
      <Card>
        <CardHeader>
          <CardTitle>Support Open Source</CardTitle>
          <CardDescription>
            Automatically tip linked open source projects when you use their APIs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto-tip OSS projects</p>
              <p className="text-sm text-muted-foreground">
                When you make a paid API call to an API linked to a GitHub repo,
                automatically donate a percentage to the project
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={ossTipEnabled}
                onChange={(e) => setOssTipEnabled(e.target.checked)}
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>

          {ossTipEnabled && (
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg">
              <label className="text-sm font-medium">Tip Percentage</label>
              <div className="flex gap-2">
                {TIP_PRESETS.map((pct) => (
                  <Button
                    key={pct}
                    variant={ossTipPercentage === pct ? "default" : "outline"}
                    size="sm"
                    onClick={() => setOssTipPercentage(pct)}
                  >
                    {pct}%
                  </Button>
                ))}
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={ossTipPercentage}
                onChange={(e) => setOssTipPercentage(parseInt(e.target.value))}
                className="w-full accent-black"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>1%</span>
                <span className="font-medium text-sm text-foreground">
                  {ossTipPercentage}% of each paid API call
                </span>
                <span>10%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Example: For a $0.01 API call at {ossTipPercentage}%, you&apos;d tip $
                {(0.01 * ossTipPercentage / 100).toFixed(4)} to the linked project
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSaveTipSettings}
              disabled={isSavingTip || !token || !settingsLoaded}
            >
              {isSavingTip ? "Saving..." : "Save Tip Settings"}
            </Button>
            {tipSaveMessage && (
              <span className={`text-sm ${tipSaveMessage.includes("Failed") ? "text-red-500" : "text-green-600"}`}>
                {tipSaveMessage}
              </span>
            )}
          </div>

          {!token && (
            <p className="text-sm text-yellow-600">
              Connect your wallet to configure tip settings
            </p>
          )}
        </CardContent>
      </Card>

      {/* Spending Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Spending Limits</CardTitle>
          <CardDescription>
            Set limits to control your API spending
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Daily Spending Limit (USDC)</label>
            <input
              type="number"
              min="0"
              value={spendingLimit}
              onChange={(e) => setSpendingLimit(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-background border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Set to 0 for unlimited spending
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Require confirmation for large payments</p>
              <p className="text-sm text-muted-foreground">
                Ask for confirmation before making payments over $1
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Limits"}
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
              <p className="font-medium">Low Balance Alerts</p>
              <p className="text-sm text-muted-foreground">
                Get notified when your balance falls below $10
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Usage Reports</p>
              <p className="text-sm text-muted-foreground">
                Receive weekly usage and spending summaries
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">API Key Activity</p>
              <p className="text-sm text-muted-foreground">
                Get notified when API keys are used from new locations
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-black"></div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* SDK Settings */}
      <Card>
        <CardHeader>
          <CardTitle>SDK Configuration</CardTitle>
          <CardDescription>
            Default settings for the OpenGrant SDK
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium">Default Timeout (seconds)</label>
            <input
              type="number"
              min="5"
              max="120"
              defaultValue="30"
              className="w-full mt-1 px-3 py-2 bg-background border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto-retry on failure</p>
              <p className="text-sm text-muted-foreground">
                Automatically retry failed API calls up to 3 times
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
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
              <p className="font-medium">Revoke All API Keys</p>
              <p className="text-sm text-muted-foreground">
                Immediately revoke all active API keys
              </p>
            </div>
            <Button variant="outline">Revoke All</Button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete Account</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete your consumer account
              </p>
            </div>
            <Button variant="destructive">Delete Account</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
