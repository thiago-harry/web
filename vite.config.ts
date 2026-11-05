import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// base "./" keeps asset paths relative, so the build works under /web/ on GitHub Pages.
// outDir "docs" lets GitHub Pages serve the build straight from the branch (folder /docs).
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: { outDir: "docs", emptyOutDir: true },
});
