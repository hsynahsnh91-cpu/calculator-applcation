import { useEffect, useState } from "react";

export type ToastTone = "ok" | "error" | "info";

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

type Listener = (items: ToastItem[]) => void;

let nextId = 1;
const items: ToastItem[] = [];
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener([...items]));
}

export function toast(message: string, tone: ToastTone = "ok"): void {
  const item = { id: nextId++, message, tone };
  items.push(item);
  emit();
  window.setTimeout(() => {
    const index = items.findIndex((entry) => entry.id === item.id);
    if (index >= 0) {
      items.splice(index, 1);
      emit();
    }
  }, 4000);
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => {
    listeners.add(setToasts);
    setToasts([...items]);
    return () => {
      listeners.delete(setToasts);
    };
  }, []);
  if (!toasts.length) return null;
  return (
    <div className="ui-root ui-toast-host" aria-live="polite">
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          className={`ui-toast${item.tone === "ok" ? "" : ` ui-toast-${item.tone}`}`}
        >
          {item.message}
        </div>
      ))}
    </div>
  );
}
