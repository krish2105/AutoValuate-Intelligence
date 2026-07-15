import type { StorybookConfig } from "@storybook/react-vite";
import { fileURLToPath } from "node:url";

/**
 * Storybook — the design-system workbench (master plan WS-F1). Renders every
 * primitive in isolation, in both themes, so a spacing/contrast/focus tweak is
 * reviewable without booting the whole app.
 *
 * Vite builder (not @storybook/nextjs): the Next framework mixes Next's vendored
 * webpack Compiler with real-webpack plugins and throws on build. Vite auto-loads
 * the app's postcss.config.mjs, so Tailwind + tokens.css render identically here.
 */
const config: StorybookConfig = {
  stories: ["../components/**/*.stories.@(ts|tsx)", "../stories/**/*.stories.@(ts|tsx)"],
  addons: [
    "@storybook/addon-essentials",
    "@storybook/addon-themes",
    "@storybook/addon-a11y",
  ],
  framework: { name: "@storybook/react-vite", options: {} },
  staticDirs: ["../public"],
  core: { disableTelemetry: true },
  viteFinal: async (cfg) => {
    // Resolve the app's "@/..." import alias (mirrors tsconfig paths).
    cfg.resolve = cfg.resolve ?? {};
    cfg.resolve.alias = {
      ...(cfg.resolve.alias ?? {}),
      "@": fileURLToPath(new URL("../", import.meta.url)),
    };
    // Force the automatic JSX runtime for esbuild-transformed files (story files
    // fell through to esbuild's classic runtime → "React is not defined"). Automatic
    // compiles JSX to react/jsx-runtime, so no React needs to be in scope.
    cfg.esbuild = { ...(cfg.esbuild ?? {}), jsx: "automatic", jsxImportSource: "react" };
    return cfg;
  },
};
export default config;
