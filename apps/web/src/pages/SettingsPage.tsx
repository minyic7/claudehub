import { useEffect, useState } from "react";
import { api } from "../api/client.js";
import Button from "../components/ui/Button.js";
import Input from "../components/ui/Input.js";
import Spinner from "../components/ui/Spinner.js";
import { getApiKey, setApiKey, clearApiKey } from "../lib/utils.js";

import type { SettingsResponse } from "@claudehub/shared";
import { DEFAULT_MAX_CONCURRENT_TICKETS } from "@claudehub/shared";

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [maxConcurrent, setMaxConcurrent] = useState(String(DEFAULT_MAX_CONCURRENT_TICKETS));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      // Prefer localStorage value, fall back to server (masked)
      setApiKeyInput(getApiKey() || s.anthropicApiKey || "");
      setMaxConcurrent(String(s.maxConcurrentTickets ?? DEFAULT_MAX_CONCURRENT_TICKETS));
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

      // Save API key to localStorage and server
      if (apiKeyInput && !apiKeyInput.startsWith("****")) {
        setApiKey(apiKeyInput);
        updates.anthropicApiKey = apiKeyInput;
      } else if (!apiKeyInput) {
        clearApiKey();
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
        <div>
          <Input
            label="ANTHROPIC API KEY"
            type="password"
            placeholder="sk-ant-..."
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
          />
          <p className="font-pixel text-[7px] text-text-muted mt-1">
            Stored in browser localStorage. Sent to server on CC start.
          </p>
        </div>

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

      <div className="mt-8 pt-6 border-t border-border-default">
        <p className="font-pixel text-[8px] text-text-muted mb-2">
          OR use Claude subscription: open the Kanban CC terminal and run /login
        </p>
      </div>
    </div>
  );
}
