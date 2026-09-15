import { contextBridge, ipcRenderer } from "electron";
import type { AnimationStudyApi } from "../app-contract.js";

const api: AnimationStudyApi = {
  getMediaToolStatus: () => ipcRenderer.invoke("media:get-tool-status"),
  openVideo: () => ipcRenderer.invoke("media:open-video"),
  getFrame: (timelinePosition) => ipcRenderer.invoke("media:get-frame", timelinePosition),
};

contextBridge.exposeInMainWorld("animationStudy", api);
