import { contextBridge, ipcRenderer } from "electron";
import type { AnimationStudyApi } from "../app-contract.js";

const api: AnimationStudyApi = {
  getMediaToolStatus: () => ipcRenderer.invoke("media:get-tool-status"),
  openVideo: () => ipcRenderer.invoke("media:open-video"),
  getFrame: (timelinePosition) => ipcRenderer.invoke("media:get-frame", timelinePosition),
  getBackgroundAnalysisStatus: () => ipcRenderer.invoke("media:get-background-analysis-status"),
  getCelInformation: (timelinePosition) => ipcRenderer.invoke("media:get-cel-information", timelinePosition),
  getAdjacentCelPosition: (timelinePosition, direction) => ipcRenderer.invoke("media:get-adjacent-cel-position", timelinePosition, direction),
  getCorrectionInformation: (timelinePosition) => ipcRenderer.invoke("media:get-correction-information", timelinePosition),
  applyExposureCorrection: (action) => ipcRenderer.invoke("media:apply-exposure-correction", action),
  undoExposureCorrection: () => ipcRenderer.invoke("media:undo-exposure-correction"),
  redoExposureCorrection: () => ipcRenderer.invoke("media:redo-exposure-correction"),
  getTimelineThumbnails: (sampleCount) => ipcRenderer.invoke("media:get-timeline-thumbnails", sampleCount),
};

contextBridge.exposeInMainWorld("animationStudy", api);
