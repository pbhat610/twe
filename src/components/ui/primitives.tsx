import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

export const cn = (...c: ClassValue[]) => twMerge(clsx(c));

type Variant = "primary" | "secondary" | "ghost" | "danger";

/**
 * Accent is reserved for the single primary action on a view.
 * Everything else is neutral. Transitions are colour-only, 150ms ease-out.
 */
export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "h-8 px-3 text-[13px]",
        size === "md" && "h-10 px-4 text-sm",
        size === "lg" && "h-12 px-6 text-[15px]",
        variant === "primary" && "bg-brand text-brand-ink shadow-sm hover:bg-brand-hover",
        variant === "secondary" && "border border-border bg-surface text-text shadow-sm hover:border-border-strong hover:bg-surface-2",
        variant === "ghost" && "text-muted hover:bg-surface-2 hover:text-text",
        variant === "danger" && "border border-bad/40 text-bad hover:bg-bad/10",
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("surface", className)} {...props} />;
}

type Tone = "neutral" | "brand" | "good" | "warn" | "bad";

/** Small rectangular tag: label, not decoration. */
export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-px text-[12px] leading-5 font-medium",
        tone === "neutral" && "border-border bg-surface-2 text-muted",
        tone === "brand" && "border-brand/25 bg-brand-soft text-brand",
        tone === "good" && "border-good/25 bg-good/10 text-good",
        tone === "warn" && "border-warn/25 bg-warn/10 text-warn",
        tone === "bad" && "border-bad/25 bg-bad/10 text-bad",
        className,
      )}
    >
      {children}
    </span>
  );
}

export const scoreTone = (s: number): Tone => (s >= 4 ? "good" : s >= 3 ? "warn" : "bad");

/** 5 tick marks: quieter and more legible than coloured dots. */
export function ScoreDots({ score }: { score: number }) {
  const color = score >= 4 ? "bg-good" : score >= 3 ? "bg-warn" : "bg-bad";
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`Score ${score} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn("h-3 w-[3px] rounded-[1px]", i <= score ? color : "bg-border-strong/60")} />
      ))}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-current border-t-transparent", className)}
      aria-hidden
    />
  );
}

export function ThinkingDots() {
  return (
    <span className="inline-flex gap-1" aria-label="Thinking">
      <span className="thinking-dot h-1 w-1 rounded-full bg-current" />
      <span className="thinking-dot h-1 w-1 rounded-full bg-current" />
      <span className="thinking-dot h-1 w-1 rounded-full bg-current" />
    </span>
  );
}

/** Wordmark: plain ink, the "+" carries the accent. */
export function Wordmark({ suffix }: { suffix?: string }) {
  return (
    <span className="font-display text-[19px] font-extrabold tracking-[-0.03em]">
      <span className="text-brand">+</span>twe
      {suffix && <span className="ml-2 font-sans text-[13px] font-medium tracking-normal text-faint">{suffix}</span>}
    </span>
  );
}
