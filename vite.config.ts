import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  root: "renderer",
  plugins: [react()],
  build: {
    outDir: "../renderer-dist",
    emptyOutDir: true,
  },
});
