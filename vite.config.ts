/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  // Tauri: keep Rust errors visible, fixed port, don't watch src-tauri.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },

  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/api/mock/**", "src/main.tsx"],
      thresholds: {
        "src/features/**/model/**": { lines: 80, functions: 80, branches: 80, statements: 80 },
        "src/shared/model/**": { lines: 80, functions: 80, branches: 80, statements: 80 },
        "src/api/*.ts": { lines: 80, functions: 80, branches: 80, statements: 80 },
      },
    },
  },
}));
