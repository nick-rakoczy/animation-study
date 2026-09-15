import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { ApplicationService } from "./application-service.js";
import { getMediaToolStatus } from "../media-tools.js";

let mainWindow: BrowserWindow | null = null;
let service: ApplicationService;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: "#121315",
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  void mainWindow.loadFile(join(import.meta.dirname, "../../../renderer-dist/index.html"));
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  service = new ApplicationService(join(app.getPath("userData"), "frame-cache"));
  ipcMain.handle("media:get-tool-status", () => getMediaToolStatus());
  ipcMain.handle("media:open-video", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Open video",
      properties: ["openFile"],
      filters: [
        { name: "Video", extensions: ["mp4", "mkv", "mov", "webm", "avi", "m4v"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    const sourcePath = result.filePaths[0];
    return result.canceled || !sourcePath ? null : service.openVideo(sourcePath);
  });
  ipcMain.handle("media:get-background-analysis-status", () => service.getBackgroundAnalysisStatus());
  ipcMain.handle("media:get-cel-information", (_event, timelinePosition: number) => service.getCelInformation(timelinePosition));
  ipcMain.handle("media:get-adjacent-cel-position", (_event, timelinePosition: number, direction: "previous" | "next") => service.getAdjacentCelPosition(timelinePosition, direction));
  ipcMain.handle("media:get-correction-information", (_event, timelinePosition: number) => service.getCorrectionInformation(timelinePosition));
  ipcMain.handle("media:apply-exposure-correction", (_event, action) => service.applyExposureCorrection(action));
  ipcMain.handle("media:undo-exposure-correction", () => service.undoExposureCorrection());
  ipcMain.handle("media:redo-exposure-correction", () => service.redoExposureCorrection());
  ipcMain.handle("media:get-timeline-thumbnails", (_event, sampleCount: number) => service.getTimelineThumbnails(sampleCount));
  ipcMain.handle("media:export-selection", async (_event, range) => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: "Choose export folder",
      properties: ["openDirectory", "createDirectory"],
    });
    const outputDirectory = result.filePaths[0];
    if (result.canceled || !outputDirectory) return null;
    const exported = await service.exportSelection(range, outputDirectory);
    return {
      outputDirectory: exported.outputDirectory,
      exportedFrameCount: exported.paths.length,
    };
  });
  ipcMain.handle("media:cancel-export", () => service.cancelExport());
  ipcMain.handle("media:clear-unused-cache", () => service.clearUnusedCache());

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => app.quit());
