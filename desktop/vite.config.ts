import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port in dev and plain relative assets in the bundle.
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.0.0") },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "safari15", outDir: "dist", sourcemap: false },
});
