import { cn } from "../../lib/utils.js";

type BadgeVariant = "feature" | "bugfix" | "refactor" | "docs" | "chore"
  | "ok" | "warn" | "error" | "info";

const variantStyles: Record<BadgeVariant, string> = {
  feature: "bg-accent/[0.12] text-accent",
  bugfix: "bg-status-error/[0.12] text-status-error",
  refactor: "bg-status-info/[0.12] text-status-info",
  docs: "bg-status-ok/[0.12] text-status-ok",
  chore: "bg-text-muted/[0.12] text-text-secondary",
  ok: "bg-status-ok/[0.12] text-status-ok",
  warn: "bg-status-warn/[0.12] text-status-warn",
  error: "bg-status-error/[0.12] text-status-error",
  info: "bg-status-info/[0.12] text-status-info",
};

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

export default function Badge({ variant, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "font-pixel text-[8px] px-1.5 py-0.5 inline-flex items-center leading-none",
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
