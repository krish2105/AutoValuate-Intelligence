import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

/**
 * The token system, rendered from the live CSS variables (master plan WS-F1).
 * Flip the theme in the toolbar — semantic + component swatches re-resolve through
 * the primitive palette, which is exactly how the app themes itself.
 */
const meta: Meta = {
  title: "Design System/Tokens",
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

function Swatch({ token, label }: { token: string; label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="h-16 w-full rounded-xl border"
        style={{ background: `hsl(var(${token}))` }}
      />
      <div className="text-xs font-medium text-fg">{label ?? token}</div>
      <code className="text-[11px] text-muted">{token}</code>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h3 className="mb-4 font-display text-sm font-bold uppercase tracking-[0.12em] text-fg">{title}</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">{children}</div>
    </section>
  );
}

const PRIMITIVES = [
  "--neutral-0", "--neutral-25", "--neutral-50", "--neutral-100", "--neutral-300",
  "--neutral-400", "--neutral-600", "--neutral-700", "--neutral-800", "--neutral-900", "--neutral-950",
  "--amber-500", "--amber-700", "--blue-400", "--blue-600",
  "--green-500", "--green-600", "--red-400", "--red-600",
];
const SEMANTIC = [
  "--bg", "--surface", "--surface-2", "--border", "--fg", "--muted",
  "--accent", "--accent-fg", "--info", "--good", "--warn", "--bad",
];
const COMPONENT = [
  "--btn-primary-bg", "--btn-primary-fg", "--btn-secondary-bg", "--btn-secondary-fg",
  "--btn-ghost-fg", "--btn-danger-bg", "--btn-danger-fg", "--card-bg", "--card-border",
];

export const Palette: Story = {
  render: () => (
    <div className="min-h-screen bg-bg p-8 text-fg">
      <h2 className="mb-1 font-display text-lg font-bold">AutoValuate design tokens</h2>
      <p className="mb-8 max-w-2xl text-sm text-muted">
        Three tiers: <strong className="text-fg">primitives</strong> hold the only literal
        color values; <strong className="text-fg">semantic</strong> tokens name intent and
        reference primitives; <strong className="text-fg">component</strong> tokens dress the
        Button and Card and reference semantics. Change the theme in the toolbar to watch it flow.
      </p>
      <Group title="Tier 1 · Primitives">
        {PRIMITIVES.map((t) => <Swatch key={t} token={t} />)}
      </Group>
      <Group title="Tier 2 · Semantic">
        {SEMANTIC.map((t) => <Swatch key={t} token={t} />)}
      </Group>
      <Group title="Tier 3 · Component">
        {COMPONENT.map((t) => <Swatch key={t} token={t} />)}
      </Group>
    </div>
  ),
};
