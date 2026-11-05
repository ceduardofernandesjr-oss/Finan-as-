"use client";
// Janelas (modal / folha no celular), confirmações e avisos (toasts).
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Button, IconButton, cx } from "./ui";

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "md" | "lg";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy-950/60 backdrop-blur-[3px]" onClick={onClose} />
      <div
        ref={ref}
        className={cx(
          "relative flex max-h-[92dvh] w-full animate-sheet flex-col rounded-t-[2rem] bg-white shadow-2xl ring-1 ring-slate-200 sm:rounded-[1.75rem] dark:bg-navy-900 dark:ring-white/10",
          size === "lg" ? "sm:max-w-3xl" : "sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 dark:border-white/[0.06]">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <IconButton label="Fechar" onClick={onClose}>
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] dark:border-white/[0.06]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}
interface ConfirmOptions {
  title: string;
  text?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  choices?: { label: string; value: string; danger?: boolean }[];
}

interface FeedbackCtx {
  toast: (text: string, tone?: ToastTone) => void;
  confirm: (o: ConfirmOptions) => Promise<string | false>;
}

const Ctx = createContext<FeedbackCtx | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: string | false) => void }) | null>(null);

  const toast = useCallback((text: string, tone: ToastTone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<string | false>((resolve) => setDialog({ ...o, resolve })),
    [],
  );

  const close = (v: string | false) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  return (
    <Ctx.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-3" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "pointer-events-auto flex max-w-md animate-pop items-start gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-2xl ring-1 backdrop-blur",
              t.tone === "success" && "bg-navy-950/95 text-white ring-brand-400/40 dark:bg-navy-900/95",
              t.tone === "error" && "bg-white/95 text-slate-900 ring-rose-300 dark:bg-navy-900/95 dark:text-white dark:ring-rose-500/40",
              t.tone === "info" && "bg-white/95 text-slate-900 ring-slate-200 dark:bg-navy-900/95 dark:text-white dark:ring-white/10",
            )}
          >
            {t.tone === "success" && <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-400" />}
            {t.tone === "error" && <XCircle className="mt-0.5 size-4 shrink-0 text-rose-600" />}
            {t.tone === "info" && <Info className="mt-0.5 size-4 shrink-0 text-brand-600 dark:text-brand-400" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      <Modal
        open={!!dialog}
        onClose={() => close(false)}
        title={
          <span className="flex items-center gap-2">
            {dialog?.danger && <AlertTriangle className="size-5 text-rose-600" />}
            {dialog?.title}
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => close(false)}>
              Cancelar
            </Button>
            {dialog?.choices ? (
              dialog.choices.map((c) => (
                <Button key={c.value} variant={c.danger ? "danger" : "primary"} onClick={() => close(c.value)}>
                  {c.label}
                </Button>
              ))
            ) : (
              <Button variant={dialog?.danger ? "danger" : "primary"} onClick={() => close("ok")} autoFocus>
                {dialog?.confirmLabel ?? "Confirmar"}
              </Button>
            )}
          </>
        }
      >
        <div className="text-sm text-slate-600 dark:text-slate-300">{dialog?.text}</div>
      </Modal>
    </Ctx.Provider>
  );
}

export function useFeedback(): FeedbackCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useFeedback fora do FeedbackProvider");
  return v;
}

/** Executa uma operação mostrando sucesso ou o erro em português. */
export function useAction() {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const exec = useCallback(
    async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
      setBusy(true);
      try {
        await fn();
        if (success) toast(success);
        return true;
      } catch (e) {
        toast(e instanceof Error ? e.message : "Algo deu errado. Tente de novo.", "error");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { busy, exec };
}
