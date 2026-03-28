import { type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils.js";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
}

export default function Button({
  variant = "secondary",
  size = "md",
  loading,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const base =
    "font-pixel inline-flex items-center justify-center border transition-colors duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";
  const sizes = {
    sm: "text-[8px] px-2 py-1 min-h-[24px]",
    md: "text-[10px] px-3 py-1.5 min-h-[30px]",
  };
  const variants = {
    primary:
      "bg-accent text-bg-base border-accent hover:bg-accent-hover",
    secondary:
      "bg-bg-elevated text-text-primary border-border-default hover:border-border-hover hover:bg-bg-card",
    danger:
      "bg-bg-elevated text-status-error border-status-error/30 hover:bg-status-error/10",
    ghost:
      "bg-transparent text-text-secondary border-transparent hover:text-text-primary hover:bg-bg-elevated",
  };

  return (
    <button
      className={cn(base, sizes[size], variants[variant], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="dot-bounce flex gap-[3px]">
          <span className="w-[4px] h-[4px] bg-current inline-block" />
          <span className="w-[4px] h-[4px] bg-current inline-block" />
          <span className="w-[4px] h-[4px] bg-current inline-block" />
        </span>
      ) : (
        children
      )}
    </button>
  );
}
