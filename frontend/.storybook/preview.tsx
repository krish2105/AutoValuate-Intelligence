import React from "react";
import type { Preview } from "@storybook/react";
import { withThemeByClassName } from "@storybook/addon-themes";
import "../app/globals.css";

// Fonts are loaded in preview-head.html (Google Fonts) and mapped onto the same
// --font-* CSS variables the app's next/font setup exposes, so type renders the same.
const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: { disable: true }, // the theme decorator owns the surface via --bg
  },
  decorators: [
    // Toggle .dark / .light on <html> — the exact mechanism next-themes uses in the app,
    // so tokens.css resolves identically. Switch themes from the Storybook toolbar.
    withThemeByClassName({
      themes: { dark: "dark", light: "light" },
      defaultTheme: "dark",
    }),
    (Story) => (
      <div className="font-sans bg-bg text-fg" style={{ padding: "2.5rem", minHeight: "100vh", width: "100%" }}>
        <Story />
      </div>
    ),
  ],
};
export default preview;
