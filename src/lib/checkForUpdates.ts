import { ask, message } from "@tauri-apps/plugin-dialog";
import { updaterCommands } from "./tauriCommands";
import { formatError } from "./errors";

interface PromptForUpdateOptions {
  // Suppress "up to date" and error dialogs — used for the automatic
  // startup check, which shouldn't interrupt the user when there's
  // nothing to report (e.g. no network yet).
  silent?: boolean;
}

export async function promptForUpdate(options: PromptForUpdateOptions = {}): Promise<void> {
  try {
    const update = await updaterCommands.checkForUpdate();
    if (!update) {
      if (!options.silent) {
        await message("You're on the latest version.", { title: "naden", kind: "info" });
      }
      return;
    }

    const shouldInstall = await ask(
      `Version ${update.version} is available. Download and install now?`,
      { title: "Update Available", kind: "info" },
    );
    if (!shouldInstall) return;

    await update.download();
    const shouldRestart = await ask(
      "Update installed. Restart naden now to apply it?",
      { title: "Update Ready", kind: "info" },
    );
    if (shouldRestart) await updaterCommands.relaunch();
  } catch (e) {
    if (!options.silent) {
      await message(formatError(e), { title: "Update Check Failed", kind: "error" });
    }
  }
}
