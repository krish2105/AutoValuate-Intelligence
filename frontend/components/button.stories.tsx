import type { Meta, StoryObj } from "@storybook/react";
import { ArrowRight, LogIn, Sparkles, Trash2 } from "lucide-react";
import { Button } from "./button";

const meta = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "inline-radio", options: ["primary", "secondary", "ghost", "danger"] },
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    pill: { control: "boolean" },
    fullWidth: { control: "boolean" },
    loading: { control: "boolean" },
    disabled: { control: "boolean" },
  },
  args: { children: "Begin appraisal", variant: "primary", size: "md" },
} satisfies Meta<typeof Button>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Variants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary" leftIcon={<Sparkles className="h-4 w-4" />}>Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger" leftIcon={<Trash2 className="h-4 w-4" />}>Danger</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const States: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button loading>Signing in</Button>
      <Button disabled>Disabled</Button>
      <Button leftIcon={<LogIn className="h-4 w-4" />}>With icon</Button>
      <Button pill>Pill CTA <ArrowRight className="h-4 w-4" /></Button>
    </div>
  ),
};

export const FullWidth: Story = {
  args: { fullWidth: true, children: "Continue without an account" },
  render: (args) => (
    <div className="w-80">
      <Button {...args} leftIcon={<Sparkles className="h-4 w-4" />} />
    </div>
  ),
};
