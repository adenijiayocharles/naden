import { useEffect } from "react";
import { useServerStore } from "../store/serverStore";
import { useVaultStore } from "../store/vaultStore";
import { useUiStore } from "../store/uiStore";
import { useTunnelStore } from "../store/tunnelStore";
import { useBroadcastStore } from "../store/broadcastStore";
import { useTerminalSettings } from "../lib/terminalSettings";
import { useUiFontSettings, applyUiFont } from "../lib/uiFontSettings";
import { settingsCommands } from "../lib/tauriCommands";
import { promptForUpdate } from "../lib/checkForUpdates";
import { shiftLightness } from "../lib/accentColor";
import { setSentryEnabled } from "../lib/sentryClient";

// Delay the startup update check, measured from when the vault unlocks, so
// it doesn't compete with initial data loading right after launch/unlock.
const UPDATE_CHECK_DELAY_MS = 10 * 60 * 1000;

// Shorter delay when no master password is set, since there's no unlock
// step gating access to the app.
const UPDATE_CHECK_DELAY_NO_PASSWORD_MS = 5 * 60 * 1000;

// Re-check periodically for as long as the app stays open.
const UPDATE_CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000;

const ACCENTS: Record<string, [string, string, string]> = {
  lime:   ["#CDFF00", "#d8ff33", "#a8cc00"],
  green:  ["#00e676", "#33eb91", "#00b85e"],
  cyan:   ["#00d4ff", "#33ddff", "#00a8cc"],
  blue:   ["#4f8ef7", "#7aaeff", "#3a6bc4"],
  purple: ["#a78bfa", "#c4b0ff", "#7c5ccc"],
  orange: ["#ff8c42", "#ffa566", "#cc6f35"],
  pink:   ["#f472b6", "#f9a8d4", "#c4588c"],
  red:    ["#ff5555", "#ff7777", "#cc4444"],
  white:  ["#ffffff", "#eeeeee", "#cccccc"],
};

export function useAppInit() {
  const fetchAll = useServerStore((s) => s.fetchAll);
  const { check } = useVaultStore();
  const loadTerminalSettings = useTerminalSettings((s) => s.load);
  const loadUiFontSettings = useUiFontSettings((s) => s.load);
  const setOnboardingComplete = useUiStore((s) => s.setOnboardingComplete);
  const setOnboardingChecked = useUiStore((s) => s.setOnboardingChecked);
  const loadTunnels = useTunnelStore((s) => s.load);
  const loadSavedBroadcastGroups = useBroadcastStore((s) => s.loadSaved);

  useEffect(() => {
    void fetchAll();
    void check();
    void loadTerminalSettings();
    void loadUiFontSettings().then(() => {
      const { fontFamily, fontSize } = useUiFontSettings.getState();
      applyUiFont(fontFamily, fontSize);
    });
    void loadTunnels();
    void loadSavedBroadcastGroups();

    Promise.all([
      settingsCommands.getSetting("theme"),
      settingsCommands.getSetting("accent"),
      settingsCommands.getSetting("accent_custom_color"),
    ])
      .then(([theme, accent, customColor]) => {
        if (theme && theme !== "dark") {
          document.documentElement.dataset.theme = theme;
        }
        const root = document.documentElement;
        if (accent === "custom" && customColor) {
          root.style.setProperty("--color-accent", customColor);
          root.style.setProperty("--color-accent-hover", shiftLightness(customColor, 15));
          root.style.setProperty("--color-accent-dim", shiftLightness(customColor, -20));
        } else if (accent && accent !== "lime" && ACCENTS[accent]) {
          const [base, hover, dim] = ACCENTS[accent];
          root.style.setProperty("--color-accent", base);
          root.style.setProperty("--color-accent-hover", hover);
          root.style.setProperty("--color-accent-dim", dim);
        }
      })
      .catch(() => {});

    settingsCommands
      .getSetting("onboarding_complete")
      .then((v) => {
        setOnboardingComplete(v === "true");
        setOnboardingChecked();
      })
      .catch(() => {
        setOnboardingChecked();
      });

    settingsCommands
      .getSetting("crash_reporting_enabled")
      .then((v) => {
        setSentryEnabled(v === "true");
      })
      .catch(() => {});
  }, [fetchAll, check, loadTerminalSettings, loadUiFontSettings, loadTunnels, loadSavedBroadcastGroups, setOnboardingComplete, setOnboardingChecked]);

  // Schedule the startup update check once the vault is unlocked (or
  // immediately if no master password is set), then recheck periodically.
  useEffect(() => {
    let updateCheckTimer: ReturnType<typeof setTimeout> | undefined;
    let updateCheckInterval: ReturnType<typeof setInterval> | undefined;

    const scheduleUpdateChecks = () => {
      const delay = useVaultStore.getState().isPasswordRequired
        ? UPDATE_CHECK_DELAY_MS
        : UPDATE_CHECK_DELAY_NO_PASSWORD_MS;

      updateCheckTimer = setTimeout(() => {
        void promptForUpdate({ silent: true });
      }, delay);

      updateCheckInterval = setInterval(() => {
        void promptForUpdate({ silent: true });
      }, UPDATE_CHECK_INTERVAL_MS);
    };

    if (useVaultStore.getState().isUnlocked) {
      scheduleUpdateChecks();
      return () => {
        clearTimeout(updateCheckTimer);
        clearInterval(updateCheckInterval);
      };
    }

    const unsubscribe = useVaultStore.subscribe((state) => {
      if (!state.isUnlocked) return;
      unsubscribe();
      scheduleUpdateChecks();
    });

    return () => {
      unsubscribe();
      clearTimeout(updateCheckTimer);
      clearInterval(updateCheckInterval);
    };
  }, []);
}
