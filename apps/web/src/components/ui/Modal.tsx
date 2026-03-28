import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../lib/utils.js";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

export default function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-in fade-in duration-200"
      onClick={handleOverlayClick}
    >
      <div
        ref={panelRef}
        className={cn(
          "bg-bg-base border border-border-default w-full max-w-lg mx-4 max-h-[85vh] flex flex-col",
          "animate-in slide-in-from-bottom-4 fade-in duration-250",
          className,
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border-default">
          <h2 className="font-pixel text-[10px] text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="font-pixel text-[10px] text-text-muted hover:text-text-primary transition-colors cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
