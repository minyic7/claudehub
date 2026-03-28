import { type SelectHTMLAttributes, forwardRef } from "react";
import { cn } from "../../lib/utils.js";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
  label?: string;
  options: { value: string; label: string }[];
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, label, options, className, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1">
        {label && (
          <label className="font-pixel text-[8px] text-text-secondary">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={cn(
            "bg-bg-input border border-border-default text-text-primary font-mono text-[13px] px-3 py-1.5",
            "focus:outline-none focus:border-accent",
            "transition-colors duration-150",
            error && "border-status-error",
            className,
          )}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error && (
          <span className="text-status-error text-[11px] font-mono">{error}</span>
        )}
      </div>
    );
  },
);
Select.displayName = "Select";
export default Select;
