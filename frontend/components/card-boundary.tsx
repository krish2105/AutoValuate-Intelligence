"use client";
import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Per-section error boundary for the results column.
 *
 * Lesson from the blank-pane bug (2026-07-15): when anything in the results path fails,
 * the user must never lose the WHOLE valuation. A crash inside one card (bad field from
 * a new backend deploy, a chart edge case, …) now degrades to a one-line notice while
 * every other section keeps rendering.
 */
export class CardBoundary extends Component<
  { name: string; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    // Log for diagnosis (shows up in the browser console / any future Sentry hook).
    console.error(`[card-boundary] "${this.props.name}" crashed:`, error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="note" className="flex items-start gap-2.5 rounded-2xl border border-warn/30 bg-warn/8 p-4 text-sm">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
        <p className="text-muted">
          The <span className="font-medium text-fg">{this.props.name}</span> section hit an
          error and was skipped — the rest of the valuation is unaffected.
        </p>
      </div>
    );
  }
}
