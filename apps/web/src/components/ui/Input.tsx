import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils.js";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  label?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, label, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="font-pixel text-[8px] text-text-secondary">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={cn(
            "bg-bg-input border border-border-default text-text-primary font-mono text-[13px] px-3 py-1.5",
            "placeholder:text-text-muted",
            "focus:outline-none focus:border-accent",
            "transition-colors duration-150",
            error && "border-status-error",
            className,
          )}
          {...props}
        />
        {error && (
          <span className="text-status-error text-[11px] font-mono">{error}</span>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";
export default Input;
