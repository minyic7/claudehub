import { useState, useRef, type ReactNode } from "react";
import { cn } from "../../lib/utils.js";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
}

export default function Tooltip({
  content,
  children,
  side = "top",
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = () => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), 300);
  };

  const hide = () => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={cn(
            "absolute z-50 px-2 py-1 font-pixel text-[8px] text-text-primary bg-bg-elevated border border-border-default whitespace-nowrap",
            "animate-in fade-in duration-150",
            side === "top" && "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
            side === "bottom" && "top-full left-1/2 -translate-x-1/2 mt-1.5",
            className,
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}
