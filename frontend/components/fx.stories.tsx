import type { Meta, StoryObj } from "@storybook/react";
import { CountUp } from "./fx";
import { aed } from "@/lib/utils";

const meta: Meta = { title: "Primitives/Motion", parameters: { layout: "centered" } };
export default meta;
type Story = StoryObj;

/** Odometer count-up used on every price read-out. Re-mount the story to replay. */
export const PriceCountUp: Story = {
  render: () => (
    <div className="font-display text-4xl font-bold text-fg">
      <CountUp value={143198} format={(v) => aed(v)} />
    </div>
  ),
};

export const PlainNumber: Story = {
  render: () => (
    <div className="tnum text-3xl font-semibold text-accent">
      <CountUp value={672} />
    </div>
  ),
};
