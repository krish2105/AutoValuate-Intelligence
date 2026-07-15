import type { Meta, StoryObj } from "@storybook/react";
import { ShieldCheck, TrendingUp } from "lucide-react";
import { Pill, SectionCard, Logo } from "./ui";

const meta: Meta = { title: "Primitives/UI", parameters: { layout: "centered" } };
export default meta;
type Story = StoryObj;

export const Pills: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Pill tone="muted">Muted</Pill>
      <Pill tone="good">Verified</Pill>
      <Pill tone="warn">Rate-limited</Pill>
      <Pill tone="bad">Loss</Pill>
      <Pill tone="info">Data</Pill>
      <Pill tone="accent">Accent</Pill>
    </div>
  ),
};

export const BrandLogo: Story = { render: () => <Logo /> };

export const Card: Story = {
  render: () => (
    <div className="w-[28rem] max-w-full">
      <SectionCard
        title="Fair-market valuation"
        subtitle="Damage-aware, fully explainable"
        icon={<TrendingUp className="h-4 w-4" />}
        right={<Pill tone="good"><ShieldCheck className="h-3 w-3" /> Verified</Pill>}
      >
        <p className="text-sm text-muted">
          Card body. Every number here traces to a trained model, a live listing, or a
          verified citation — the card chrome is the same primitive everywhere in the app.
        </p>
      </SectionCard>
    </div>
  ),
};
