import type { AnimationStudyApi } from "../../src/app-contract.js";

declare global {
  interface Window {
    readonly animationStudy: AnimationStudyApi;
  }
}

declare module "*.css";

export {};
