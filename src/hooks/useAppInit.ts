import { useEffect } from "react";
import { useServerStore } from "../store/serverStore";
import { useVaultStore } from "../store/vaultStore";
import { useUiStore } from "../store/uiStore";
import { useTunnelStore } from "../store/tunnelStore";
import { useTerminalSettings } from "../lib/terminalSettings";
import { settingsCommands } from "../lib/tauriCommands";
import { promptForUpdate } from "../lib/checkForUpdates";

// Delay the startup update check so it doesn't compete with initial data
// loading, and to give the network a moment to come up after launch.
const UPDATE_CHECK_DELAY_MS = 3000;

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
  const setOnboardingComplete = useUiStore((s) => s.setOnboardingComplete);
  const setOnboardingChecked = useUiStore((s) => s.setOnboardingChecked);
  const loadTunnels = useTunnelStore((s) => s.load);

  useEffect(() => {
    void fetchAll();
    void check();
    void loadTerminalSettings();
    void loadTunnels();

    Promise.all([
      settingsCommands.getSetting("theme"),
      settingsCommands.getSetting("accent"),
    ])
      .then(([theme, accent]) => {
        if (theme && theme !== "dark") {
          document.documentElement.dataset.theme = theme;
        }
        if (accent && accent !== "lime" && ACCENTS[accent]) {
          const [base, hover, dim] = ACCENTS[accent];
          const root = document.documentElement;
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

    const updateCheckTimer = setTimeout(() => {
      void promptForUpdate({ silent: true });
    }, UPDATE_CHECK_DELAY_MS);

    return () => clearTimeout(updateCheckTimer);
  }, [fetchAll, check, loadTerminalSettings, loadTunnels, setOnboardingComplete, setOnboardingChecked]);
}
