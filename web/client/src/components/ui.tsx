import { useEffect, type ReactNode, type ButtonHTMLAttributes } from "react";
import { Ghost, X } from "lucide-react";
import { cx } from "../lib";

/* ── Logo ─────────────────────────────────────────────────────────────── */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <div
      className="grid place-items-center shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        background: "linear-gradient(150deg, #8f8dff 0%, #6e6bf5 45%, #4a47c9 100%)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.35) inset, 0 0 0 1px rgba(255,255,255,0.12) inset, 0 8px 24px -8px rgba(110,107,245,0.85)",
      }}
    >
      <Ghost size={size * 0.56} strokeWidth={2.2} color="#fff" />
    </div>
  );
}

export function Wordmark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <div className={cx("flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span
        className="font-semibold tracking-[-0.02em] text-gradient"
        style={{ fontSize: size * 0.5 }}
      >
        NovaChat
      </span>
    </div>
  );
}

/* ── Button ───────────────────────────────────────────────────────────── */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "text-white bg-[linear-gradient(180deg,#8280ff_0%,#5a57e6_100%)] " +
    "shadow-[0_1px_0_rgba(255,255,255,0.28)_inset,0_10px_30px_-10px_rgba(110,107,245,0.85)] " +
    "hover:brightness-[1.08]",
  secondary:
    "glass-soft text-fg hover:bg-white/[0.08] " +
    "shadow-[0_1px_0_rgba(255,255,255,0.08)_inset]",
  ghost: "text-fg-muted hover:text-fg hover:bg-white/[0.06]",
  danger:
    "text-white bg-[linear-gradient(180deg,#fb7185_0%,#e11d48_100%)] " +
    "shadow-[0_1px_0_rgba(255,255,255,0.24)_inset,0_10px_30px_-10px_rgba(251,113,133,0.8)] " +
    "hover:brightness-[1.08]",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[10px]",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-[14px]",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center font-medium whitespace-nowrap select-none",
        "transition-all duration-150 active:scale-[0.98]",
        "disabled:opacity-45 disabled:pointer-events-none",
        VARIANT[variant],
        SIZE[size],
        className
      )}
    >
      {loading && (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
      )}
      {children}
    </button>
  );
}

/* ── Modal ────────────────────────────────────────────────────────────── */
export function Modal({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-fade-in"
      style={{ background: "rgba(3,4,9,0.68)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="w-full max-w-sm rounded-[22px] glass-strong glass-hi p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalClose({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      aria-label="Close"
      className="absolute top-4 right-4 grid place-items-center w-7 h-7 rounded-lg text-fg-subtle hover:text-fg hover:bg-white/[0.08] transition-colors"
    >
      <X size={16} />
    </button>
  );
}

/* ── Status dot ───────────────────────────────────────────────────────── */
export function StatusDot({ tone = "success" }: { tone?: "success" | "warning" | "muted" }) {
  const color =
    tone === "success" ? "var(--color-success)" : tone === "warning" ? "var(--color-warning)" : "var(--color-fg-subtle)";
  return (
    <span className="relative flex w-2 h-2 shrink-0">
      {tone !== "muted" && (
        <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: color }} />
      )}
      <span
        className="relative w-2 h-2 rounded-full"
        style={{ background: color, boxShadow: `0 0 10px ${color}` }}
      />
    </span>
  );
}

/* ── Toasts ───────────────────────────────────────────────────────────── */
export type ToastType = "info" | "error" | "success" | "warn";
export interface ToastData {
  id: string;
  msg: string;
  type: ToastType;
}

const TOAST_GLOW: Record<ToastType, string> = {
  info: "0 0 0 1px rgba(110,107,245,0.35) inset, 0 20px 50px -20px rgba(0,0,0,0.9)",
  error: "0 0 0 1px rgba(251,113,133,0.5) inset, 0 20px 50px -20px rgba(0,0,0,0.9)",
  success: "0 0 0 1px rgba(52,211,153,0.5) inset, 0 20px 50px -20px rgba(0,0,0,0.9)",
  warn: "0 0 0 1px rgba(251,191,36,0.5) inset, 0 20px 50px -20px rgba(0,0,0,0.9)",
};

export function ToastItem({
  toast,
  onRemove,
}: {
  toast: ToastData;
  onRemove: (id: string) => void;
}) {
  useEffect(() => {
    const t = setTimeout(() => onRemove(toast.id), 3600);
    return () => clearTimeout(t);
  }, [toast.id, onRemove]);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl glass-strong animate-fade-up"
      style={{ boxShadow: TOAST_GLOW[toast.type] }}
    >
      <span className="text-[13px] text-fg flex-1">{toast.msg}</span>
      <button
        onClick={() => onRemove(toast.id)}
        aria-label="Dismiss"
        className="text-fg-subtle hover:text-fg transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}
