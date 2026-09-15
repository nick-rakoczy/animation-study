import { contextBridge, ipcRenderer } from "electron";
import type { AnimationStudyApi } from "../app-contract.js";

const api: AnimationStudyApi = {
  getMediaToolStatus: () => ipcRenderer.invoke("media:get-tool-status"),
  openVideo: () => ipcRenderer.invoke("media:open-video"),
  getFrame: (timelinePosition) => ipcRenderer.invoke("media:get-frame", timelinePosition),
  getCelInformation: (timelinePosition) => ipcRenderer.invoke("media:get-cel-information", timelinePosition),
  getTimelineThumbnails: (sampleCount) => ipcRenderer.invoke("media:get-timeline-thumbnails", sampleCount),
};

contextBridge.exposeInMainWorld("animationStudy", api);
