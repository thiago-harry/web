import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base relativa: o build funciona em qualquer caminho (ex.: thiago-harry.github.io/web/).
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
