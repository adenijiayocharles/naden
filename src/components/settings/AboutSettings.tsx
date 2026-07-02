import { useState, useEffect, useCallback } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { crashReportingCommands, updaterCommands, type UpdateInfo } from "../../lib/tauriCommands";
import { setSentryEnabled } from "../../lib/sentryClient";
import { formatError } from "../../lib/errors";
import { settingsCommands } from "../../lib/tauriCommands";
import { SectionHeader, Row, RowLabel } from "./SettingsShared";

interface AboutSettingsProps {
  initialSettings: Record<string, string>;
  flashSaved: () => void;
}

export default function AboutSettings({ initialSettings, flashSaved }: AboutSettingsProps) {
  const [appVersion, setAppVersion] = useState("");
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "error">("idle");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [crashReportingAvailable, setCrashReportingAvailable] = useState(false);
  const [crashReportingEnabled, setCrashReportingEnabled] = useState(true);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
    crashReportingCommands.isAvailable().then(setCrashReportingAvailable).catch(() => {});
  }, []);

  useEffect(() => {
    if (initialSettings.crash_reporting_enabled !== undefined) {
      setCrashReportingEnabled(initialSettings.crash_reporting_enabled !== "false");
    }
  }, [initialSettings]);

  const checkForUpdates = useCallback(async () => {
    setUpdateState("checking");
    setUpdateError(null);
    try {
      const update = await updaterCommands.checkForUpdate();
      if (update) {
        setUpdateInfo(update);
        setUpdateState("available");
      } else {
        setUpdateState("up-to-date");
      }
    } catch (e) {
      setUpdateError(formatError(e));
      setUpdateState("error");
    }
  }, []);

  const installUpdate = useCallback(async () => {
    if (!updateInfo) return;
    setUpdateState("downloading");
    setUpdateError(null);
    try {
      await updateInfo.download();
      setUpdateState("ready");
    } catch (e) {
      setUpdateError(formatError(e));
      setUpdateState("error");
    }
  }, [updateInfo]);

  const saveCrashReporting = (enabled: boolean) => {
    setCrashReportingEnabled(enabled);
    setSentryEnabled(enabled);
    settingsCommands.setSetting("crash_reporting_enabled", String(enabled)).catch(() => {});
    flashSaved();
  };

  return (
    <div>
      <SectionHeader title="About" />

      <Row>
        <RowLabel title="Version" description={`naden ${appVersion}`} />
      </Row>

      <Row>
        <RowLabel
          title="Software updates"
          description={
            updateState === "checking" ? "Checking for updates…"
            : updateState === "up-to-date" ? "You're up to date."
            : updateState === "available" ? `Version ${updateInfo?.version} is available.`
            : updateState === "downloading" ? "Downloading update…"
            : updateState === "ready" ? "Update installed — restart to apply."
            : updateState === "error" ? (updateError ?? "Update check failed.")
            : "Check for a newer version of naden."
          }
        />
        {updateState === "ready" ? (
          <Button onClick={() => { void updaterCommands.relaunch(); }}>
            Restart now
          </Button>
        ) : updateState === "available" ? (
          <Button onClick={() => { void installUpdate(); }}>
            Download &amp; install
          </Button>
        ) : (
          <Button
            variant="secondary"
            onClick={() => { void checkForUpdates(); }}
            disabled={updateState === "checking" || updateState === "downloading"}
            className="h-8"
          >
            Check for updates
          </Button>
        )}
      </Row>

      <Row>
        <RowLabel
          title="Crash reporting"
          description={
            !crashReportingAvailable
              ? "Not available in this build."
              : "Send anonymous crash reports to help fix bugs. On by default — see below for exactly what's included. Takes effect after restart."
          }
        />
        <Switch
          aria-label="Crash reporting"
          checked={crashReportingEnabled}
          disabled={!crashReportingAvailable}
          onCheckedChange={saveCrashReporting}
        />
      </Row>

      {crashReportingAvailable && (
        <div className="mt-1 mb-2 rounded-md border border-stroke-subtle px-3 py-3 space-y-2.5">
          <div>
            <p className="text-meta font-medium text-white/70 mb-1">What's included</p>
            <ul className="text-meta text-muted space-y-0.5 list-disc list-inside">
              <li>Crash type and source location within naden's code</li>
              <li>Stack trace (line numbers inside naden — no file paths from your machine)</li>
              <li>App version, macOS version, and CPU architecture</li>
            </ul>
          </div>
          <div>
            <p className="text-meta font-medium text-white/70 mb-1">What's never included</p>
            <ul className="text-meta text-muted space-y-0.5 list-disc list-inside">
              <li>Server names, hostnames, or IP addresses</li>
              <li>SSH credentials, keys, or passphrases</li>
              <li>Panic message content (stripped before transmission)</li>
              <li>Your name, email, or any personal identifier</li>
            </ul>
          </div>
          <p className="text-meta text-muted/70">
            Reports are sent to Sentry and used only to find and fix crashes in naden.
          </p>
        </div>
      )}
    </div>
  );
}
