import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base is set for GitHub Pages project sites (https://<user>.github.io/<repo>/).
// Override with BASE_PATH env (the deploy workflow sets it from the repo name).
const base = process.env.BASE_PATH || "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
