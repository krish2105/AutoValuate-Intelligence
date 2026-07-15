"use client";
/**
 * Button — the design-system's primary interactive primitive (master plan WS-F1).
 *
 * Before this, every button was hand-rolled Tailwind: the amber-CTA pattern
 * (`rounded-xl bg-accent text-accent-fg hover:brightness-105 disabled:opacity-*`)
 * was copy-pasted across auth, onboarding, the assistant, and more — so a spacing
 * or focus-ring tweak meant editing N places and hoping they matched.
 *
 * Variants author against the Tier-3 component tokens (--btn-* in app/tokens.css,
 * surfaced as Tailwind `btn-*` colors), so a palette or theme change flows through
 * every button for free. `className` is merged last (via cn/tailwind-merge), so any
 * one-off can still override without forking the component.
 */
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-btn-primary text-btn-primary-fg shadow-glow hover:brightness-105",
  secondary: "border bg-btn-secondary text-btn-secondary-fg hover:brightness-110",
  ghost: "text-btn-ghost-fg hover:bg-surface-2 hover:text-fg",
  danger: "bg-btn-danger text-btn-danger-fg hover:brightness-105",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-9 gap-1.5 px-3 text-[13px]",
  md: "h-10 gap-2 px-4 text-sm",
  lg: "h-12 gap-2 px-6 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Fully-rounded pill (the hero-CTA silhouette) instead of the default rounded-xl. */
  pill?: boolean;
  /** Stretch to the container width — common in modals and forms. */
  fullWidth?: boolean;
  /** Show a spinner and disable interaction while an async action is in flight. */
  loading?: boolean;
  /** Icon rendered before the label (hidden while loading — the spinner takes its place). */
  leftIcon?: ReactNode;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", pill, fullWidth, loading, leftIcon,
    className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex select-none items-center justify-center font-semibold transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        "disabled:cursor-not-allowed disabled:opacity-60",
        pill ? "rounded-full" : "rounded-xl",
        fullWidth && "w-full",
        SIZES[size],
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        leftIcon
      )}
      {children}
    </button>
  );
});
