import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // La démo utilise directement les sources de la lib (rechargement à chaud).
    alias: { "react-speech-listener": fileURLToPath(new URL("../src/index.ts", import.meta.url)) },
    dedupe: ["react", "react-dom"],
  },
});
