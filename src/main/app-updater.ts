import { BrowserWindow, dialog, shell } from "electron";
import electronUpdater from "electron-updater";

const { autoUpdater } = electronUpdater;
const latestReleasePage = "https://github.com/nick-rakoczy/animation-study/releases/latest";

export function startAppImageUpdater(window: BrowserWindow): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  let downloadStarted = false;
  let errorShown = false;

  const reportUpdateError = (error: unknown) => {
    clearDownloadProgress(window);
    console.warn("Animation Study update failed", error);
    if (!downloadStarted || errorShown || window.isDestroyed()) return;
    errorShown = true;
    void (async () => {
      const result = await dialog.showMessageBox(window, {
        type: "error",
        title: "Update failed",
        message: "Animation Study could not complete the update",
        detail: "You can download the latest AppImage from GitHub instead.",
        buttons: ["View release", "Close"],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response === 0) await shell.openExternal(latestReleasePage);
    })();
  };

  autoUpdater.on("update-available", (update) => {
    void (async () => {
      if (window.isDestroyed()) return;
      const result = await dialog.showMessageBox(window, {
        type: "info",
        title: "Update available",
        message: `Animation Study ${update.version} is available`,
        detail: "Download it now? You can keep using the app while it downloads.",
        buttons: ["Download update", "Not now"],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response !== 0 || window.isDestroyed()) return;

      downloadStarted = true;
      window.setProgressBar(0);
      window.setTitle("Animation Study (downloading update)");
      try {
        await autoUpdater.downloadUpdate();
      } catch (error) {
        reportUpdateError(error);
      }
    })();
  });

  autoUpdater.on("download-progress", (progress) => {
    if (window.isDestroyed()) return;
    const percent = Math.max(0, Math.min(100, progress.percent));
    window.setProgressBar(percent / 100);
    window.setTitle(`Animation Study (${Math.round(percent)}% update downloaded)`);
  });

  autoUpdater.on("update-downloaded", (update) => {
    clearDownloadProgress(window);
    void (async () => {
      if (window.isDestroyed()) return;
      const result = await dialog.showMessageBox(window, {
        type: "info",
        title: "Update ready",
        message: `Animation Study ${update.version} is ready to install`,
        detail: "Restart now to replace the current AppImage. If you choose Later, the update will install when you quit.",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
      });
      if (result.response === 0) autoUpdater.quitAndInstall(false, true);
    })();
  });

  autoUpdater.on("error", reportUpdateError);

  void autoUpdater.checkForUpdates().catch((error: unknown) => {
    console.warn("Could not check for an Animation Study update", error);
  });
}

function clearDownloadProgress(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  window.setProgressBar(-1);
  window.setTitle("Animation Study");
}
