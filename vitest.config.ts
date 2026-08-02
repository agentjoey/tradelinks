import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    // tsconfig keeps jsx: "preserve" for Next; tests need the automatic runtime.
    jsx: "automatic",
  },
  test: {
    // Spread the defaults so the built-in dist/.cache/.git/.idea/.output
    // exclusions survive; only add the Playwright e2e directory on top.
    exclude: [...configDefaults.exclude, "test/e2e/**"],
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    setupFiles: ["test/setup-dom.ts"],
  },
});
