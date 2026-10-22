import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { AnimationStudyApi } from "../app-contract.js";

const api: AnimationStudyApi = {
  getMediaToolStatus: () => ipcRenderer.invoke("media:get-tool-status"),
  chooseFfmpeg: () => ipcRenderer.invoke("media:choose-ffmpeg"),
  resetFfmpeg: () => ipcRenderer.invoke("media:reset-ffmpeg"),
  openVideo: () => ipcRenderer.invoke("media:open-video"),
  openDroppedVideo: async (file) => {
    const sourcePath = webUtils.getPathForFile(file);
    if (!sourcePath) throw new Error("Drop a video file from your computer");
    return ipcRenderer.invoke("media:open-dropped-video", sourcePath);
  },
  onOpenVideoRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("media:request-open-video", listener);
    return () => ipcRenderer.removeListener("media:request-open-video", listener);
  },
  onClearUnusedCacheRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("media:request-clear-unused-cache", listener);
    return () => ipcRenderer.removeListener("media:request-clear-unused-cache", listener);
  },
  setFileMenuState: (state) => ipcRenderer.send("media:set-file-menu-state", state),
  getBackgroundAnalysisStatus: () => ipcRenderer.invoke("media:get-background-analysis-status"),
  getCelInformation: (timelinePosition) => ipcRenderer.invoke("media:get-cel-information", timelinePosition),
  getAdjacentCelPosition: (timelinePosition, direction) => ipcRenderer.invoke("media:get-adjacent-cel-position", timelinePosition, direction),
  getCorrectionInformation: (timelinePosition) => ipcRenderer.invoke("media:get-correction-information", timelinePosition),
  applyExposureCorrection: (action) => ipcRenderer.invoke("media:apply-exposure-correction", action),
  undoExposureCorrection: () => ipcRenderer.invoke("media:undo-exposure-correction"),
  redoExposureCorrection: () => ipcRenderer.invoke("media:redo-exposure-correction"),
  getTimelineThumbnails: (sampleCount) => ipcRenderer.invoke("media:get-timeline-thumbnails", sampleCount),
  exportSelection: (range) => ipcRenderer.invoke("media:export-selection", range),
  cancelExport: () => ipcRenderer.invoke("media:cancel-export"),
  clearUnusedCache: () => ipcRenderer.invoke("media:clear-unused-cache"),
};

contextBridge.exposeInMainWorld("animationStudy", api);
