import { useState, useEffect, useRef, useCallback } from "react";
import { useUiStore, type SettingsSection } from "../../store/uiStore";
import { settingsCommands } from "../../lib/tauriCommands";
import { setSentryEnabled } from "../../lib/sentryClient";
import AppearanceSettings from "./AppearanceSettings";
import SecuritySettings from "./SecuritySettings";
import TerminalSettings from "./TerminalSettings";
import AiSettings from "./AiSettings";
import AboutSettings from "./AboutSettings";

type Section = SettingsSection;

const NAV_ITEMS: { id: Section; label: string; icon: React.ReactNode }[] = [
  {
    id: "appearance",
    label: "Appearance",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
      </svg>
    ),
  },
  {
    id: "security",
    label: "Security",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    id: "terminal",
    label: "Terminal",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
      </svg>
    ),
  },
  {
    id: "assistant",
    label: "AI Assistant",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    id: "about",
    label: "About",
    icon: (
      <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
];

export default function SettingsPage() {
  const settingsSection = useUiStore((s) => s.settingsSection);
  const [activeSection, setActiveSection] = useState<Section>(settingsSection);
  const setVaultTimeoutMins = useUiStore((s) => s.setVaultTimeoutMins);

  const [savedFlash, setSavedFlash] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashSaved = useCallback(() => {
    setSavedFlash(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSavedFlash(false), 2000);
  }, []);

  const [initialSettings, setInitialSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    settingsCommands.getAllSettings().then((s) => {
      setInitialSettings(s);
      if (s.vault_timeout_minutes != null) {
        setVaultTimeoutMins(Number(s.vault_timeout_minutes));
      }
      setSentryEnabled(s.crash_reporting_enabled !== "false");
    }).catch(() => {});
  }, [setVaultTimeoutMins]);

  useEffect(() => {
    setActiveSection(settingsSection);
  }, [settingsSection]);

  return (
    <div className="flex h-full overflow-hidden bg-surface-1">
      <nav className="w-52 shrink-0 border-r border-stroke-subtle bg-surface-0 flex flex-col p-3">
        <p className="text-xs font-semibold text-muted uppercase tracking-wider px-3 mb-3 mt-1">Settings</p>
        <div className="flex flex-col gap-0.5 flex-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`flex items-center gap-2.5 px-3 py-2 rounded text-sm text-left transition-colors w-full ${
                activeSection === item.id
                  ? "bg-accent/15 text-accent-fg"
                  : "text-secondary hover:text-white hover:bg-surface-2"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
        <div className="px-3 pb-1 h-5">
          <span
            className={`text-xs text-success transition-opacity duration-300 ${savedFlash ? "opacity-100" : "opacity-0"}`}
            aria-live="polite"
          >
            ✓ Saved
          </span>
        </div>
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-8">
          {activeSection === "appearance" && <AppearanceSettings initialSettings={initialSettings} flashSaved={flashSaved} />}
          {activeSection === "security"   && <SecuritySettings   initialSettings={initialSettings} flashSaved={flashSaved} />}
          {activeSection === "terminal"   && <TerminalSettings   initialSettings={initialSettings} flashSaved={flashSaved} />}
          {activeSection === "assistant"  && <AiSettings flashSaved={flashSaved} />}
          {activeSection === "about"      && <AboutSettings      initialSettings={initialSettings} flashSaved={flashSaved} />}
        </div>
      </div>
    </div>
  );
}
