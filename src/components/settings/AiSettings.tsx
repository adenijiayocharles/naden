import { useState, useEffect } from "react";
import { Button } from "../ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";
import ConfirmDeleteModal from "../shared/ConfirmDeleteModal";
import { assistantCommands, type AssistantStatus } from "../../lib/commands/assistant";
import { formatError } from "../../lib/errors";
import { SectionHeader, Row, RowLabel, PasswordInput } from "./SettingsShared";

interface AiSettingsProps {
  flashSaved: () => void;
}

export default function AiSettings({ flashSaved }: AiSettingsProps) {
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus | null>(null);
  const [addingProvider, setAddingProvider] = useState<"openai" | "anthropic" | "openrouter" | null>(null);
  const [addKeyInput, setAddKeyInput] = useState("");
  const [confirmForgetProvider, setConfirmForgetProvider] = useState<"openai" | "anthropic" | "openrouter" | null>(null);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);

  useEffect(() => {
    assistantCommands.getStatus().then(setAssistantStatus).catch(() => {});
  }, []);

  const submitAddKey = async (provider: "openai" | "anthropic" | "openrouter") => {
    setAssistantLoading(true);
    setAssistantError(null);
    try {
      await assistantCommands.setApiKey(provider, addKeyInput);
      if (!assistantStatus?.openaiConfigured && !assistantStatus?.anthropicConfigured && !assistantStatus?.openrouterConfigured) {
        await assistantCommands.setEnabled(true);
      }
      setAssistantStatus(await assistantCommands.getStatus());
      setAddKeyInput("");
      setAddingProvider(null);
      flashSaved();
    } catch (e) {
      setAssistantError(formatError(e));
    } finally {
      setAssistantLoading(false);
    }
  };

  const forgetProviderKey = async (provider: "openai" | "anthropic" | "openrouter") => {
    setAssistantLoading(true);
    setAssistantError(null);
    try {
      await assistantCommands.clearProviderKey(provider);
      setAssistantStatus(await assistantCommands.getStatus());
      flashSaved();
    } catch (e) {
      setAssistantError(formatError(e));
    } finally {
      setAssistantLoading(false);
    }
  };

  const switchToProvider = async (provider: string) => {
    const prev = assistantStatus;
    setAssistantStatus((s) => (s ? { ...s, activeProvider: provider } : s));
    await assistantCommands.switchProvider(provider).catch((e) => {
      setAssistantStatus(prev);
      setAssistantError(formatError(e));
    });
    flashSaved();
  };

  const toggleAssistantEnabled = async (enabled: boolean) => {
    const prev = assistantStatus;
    setAssistantStatus((s) => (s ? { ...s, enabled } : s));
    await assistantCommands.setEnabled(enabled).catch((e) => {
      setAssistantStatus(prev);
      setAssistantError(formatError(e));
    });
    flashSaved();
  };

  const toggleAssistantPersistHistory = async (persistHistory: boolean) => {
    const prev = assistantStatus;
    setAssistantStatus((s) => (s ? { ...s, persistHistory } : s));
    await assistantCommands.setPersistHistory(persistHistory).catch((e) => {
      setAssistantStatus(prev);
      setAssistantError(formatError(e));
    });
    flashSaved();
  };

  return (
    <div>
      <SectionHeader
        title="AI Assistant"
        description="Bring your own API key. Off by default — when enabled, prompts you send may include terminal context and are sent to the provider you choose below."
      />

      {(["openai", "anthropic", "openrouter"] as const).map((p) => {
        const isConfigured = p === "openai" ? assistantStatus?.openaiConfigured : p === "anthropic" ? assistantStatus?.anthropicConfigured : assistantStatus?.openrouterConfigured;
        const isAdding = addingProvider === p;
        const label = p === "openai" ? "OpenAI" : p === "anthropic" ? "Anthropic" : "OpenRouter";
        return (
          <div key={p} className="border-b border-stroke-subtle">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2.5">
                <span className="text-sm text-white font-medium">{label}</span>
                {isConfigured && (
                  <span className="text-[11px] font-medium text-success bg-success-subtle border border-success-subtle rounded px-1.5 py-0.5 leading-none">
                    Configured
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {isConfigured && (
                  <Button
                    variant="ghost"
                    onClick={() => { setConfirmForgetProvider(p); setAssistantError(null); }}
                    disabled={assistantLoading}
                    className="h-auto px-0 text-sm text-secondary hover:text-red-400 hover:bg-transparent"
                  >
                    Forget
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setAddingProvider(isAdding ? null : p);
                    setAddKeyInput("");
                    setAssistantError(null);
                  }}
                  className="h-auto px-0 text-sm text-secondary hover:text-white hover:bg-transparent gap-1"
                >
                  {isConfigured ? "Update key" : "Add key"}
                  <svg className={`w-3 h-3 text-muted transition-transform ${isAdding ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>
              </div>
            </div>
            {isAdding && (
              <div className="mb-3 space-y-3 p-3 bg-surface-0 rounded-lg border border-stroke-subtle">
                <PasswordInput
                  autoFocus
                  value={addKeyInput}
                  onChange={(v) => { setAddKeyInput(v); setAssistantError(null); }}
                  placeholder={`${label} API key`}
                />
                {assistantError && <p className="text-xs text-error">{assistantError}</p>}
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => { setAddingProvider(null); setAddKeyInput(""); setAssistantError(null); }} className="flex-1">Cancel</Button>
                  <Button onClick={() => { void submitAddKey(p); }} disabled={assistantLoading || !addKeyInput.trim()} className="flex-1">
                    {assistantLoading ? "Saving…" : "Save key"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {[assistantStatus?.openaiConfigured, assistantStatus?.anthropicConfigured, assistantStatus?.openrouterConfigured].filter(Boolean).length > 1 && (
        <Row>
          <RowLabel title="Active provider" description="Which provider handles your messages" />
          <Select
            value={assistantStatus?.activeProvider ?? "openai"}
            onValueChange={(value) => { if (value) void switchToProvider(value); }}
          >
            <SelectTrigger aria-label="Active AI provider" className="h-10 shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {assistantStatus?.openaiConfigured && <SelectItem value="openai">OpenAI</SelectItem>}
              {assistantStatus?.anthropicConfigured && <SelectItem value="anthropic">Anthropic</SelectItem>}
              {assistantStatus?.openrouterConfigured && <SelectItem value="openrouter">OpenRouter</SelectItem>}
            </SelectContent>
          </Select>
        </Row>
      )}

      {(assistantStatus?.openaiConfigured || assistantStatus?.anthropicConfigured || assistantStatus?.openrouterConfigured) && (
        <>
          <Row>
            <RowLabel title="Enable assistant" />
            <Switch
              aria-label="Enable AI assistant"
              checked={assistantStatus?.enabled ?? false}
              onCheckedChange={(checked) => { void toggleAssistantEnabled(checked); }}
            />
          </Row>
          <Row>
            <RowLabel
              title="Save chat history"
              description="Encrypted at rest with the same key as your credentials. Off by default — turning it off erases everything already saved."
            />
            <Select
              value={(assistantStatus?.persistHistory ?? false) ? "on" : "off"}
              onValueChange={(value) => { void toggleAssistantPersistHistory(value === "on"); }}
            >
              <SelectTrigger aria-label="Save AI assistant chat history to disk" className="h-10 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="on">On</SelectItem>
                <SelectItem value="off">Off</SelectItem>
              </SelectContent>
            </Select>
          </Row>
        </>
      )}

      {confirmForgetProvider && (
        <ConfirmDeleteModal
          title={`Forget ${confirmForgetProvider === "openai" ? "OpenAI" : confirmForgetProvider === "anthropic" ? "Anthropic" : "OpenRouter"} key?`}
          description="The stored API key will be permanently removed."
          confirmLabel="Forget key"
          busy={assistantLoading}
          onConfirm={() => {
            const p = confirmForgetProvider;
            setConfirmForgetProvider(null);
            void forgetProviderKey(p);
          }}
          onCancel={() => setConfirmForgetProvider(null)}
        />
      )}
    </div>
  );
}
