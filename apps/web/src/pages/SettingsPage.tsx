import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import Button from "../components/ui/Button.js";
import Input from "../components/ui/Input.js";
import Spinner from "../components/ui/Spinner.js";

import type { SettingsResponse } from "@claudehub/shared";

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState("20");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setApiKey(s.anthropicApiKey || "");
      setMaxConcurrent(String(s.maxConcurrentTickets ?? 20));
      setLoading(false);
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const updates: Record<string, unknown> = {
        maxConcurrentTickets: Number(maxConcurrent),
      };
      if (apiKey && apiKey !== settings?.anthropicApiKey) {
        updates.anthropicApiKey = apiKey;
      }
      await api.updateSettings(updates);
      setMessage("Saved");
      setTimeout(() => setMessage(""), 2000);
    } catch {
      setMessage("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="font-pixel text-[12px] text-text-primary mb-6">
        SETTINGS
      </h1>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <Input
          label="ANTHROPIC API KEY"
          type="password"
          placeholder="sk-ant-..."
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />

        <Input
          label="MAX CONCURRENT TICKETS"
          type="number"
          min={1}
          max={100}
          value={maxConcurrent}
          onChange={(e) => setMaxConcurrent(e.target.value)}
        />

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" loading={saving}>
            SAVE
          </Button>
          {message && (
            <span
              className={`font-pixel text-[8px] ${message === "Saved" ? "text-status-ok" : "text-status-error"}`}
            >
              {message}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
