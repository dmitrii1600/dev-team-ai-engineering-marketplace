import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const TOAST_MS = 1800;

export type ToastVariant = "ok" | "error";
type ShowToast = (message: string, variant?: ToastVariant) => void;

const ToastContext = createContext<ShowToast>(() => undefined);

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; variant: ToastVariant } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const counter = useRef(0);

  const show = useCallback<ShowToast>((message, variant = "ok") => {
    window.clearTimeout(timer.current);
    counter.current += 1;
    setToast({ id: counter.current, message, variant });
    timer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* A new key restarts the pop animation when a second toast replaces the first. */}
      <div className={toast ? "toast is-visible" : "toast"} key={toast?.id ?? 0} id="toast" role="status" aria-live="polite">
        {toast ? (
          <>
            {toast.variant === "ok" && <span className="check">✓</span>} {toast.message}
          </>
        ) : null}
      </div>
    </ToastContext.Provider>
  );
}
