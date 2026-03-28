import { cn } from "../../lib/utils.js";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

export default function Spinner({ size = "md", className }: SpinnerProps) {
  const sizes = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  // 4-frame pixel paw rotation via CSS animation
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center animate-spin",
        sizes[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="w-full h-full text-accent"
      >
        {/* Pixel-art paw shape */}
        <circle cx="12" cy="14" r="4" fill="currentColor" opacity="0.9" />
        <circle cx="6" cy="8" r="2.5" fill="currentColor" opacity="0.7" />
        <circle cx="18" cy="8" r="2.5" fill="currentColor" opacity="0.5" />
        <circle cx="4" cy="14" r="2" fill="currentColor" opacity="0.3" />
      </svg>
    </div>
  );
}
