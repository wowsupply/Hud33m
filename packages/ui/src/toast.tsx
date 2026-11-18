import { useSyncExternalStore } from 'react';
import { cn } from './utils';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, kind: Toast['kind'] = 'info') {
  const id = nextId++;
  toasts = [...toasts, { id, text, kind }];
  emit();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emit();
  }, 4000);
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex flex-col items-center gap-2 px-4">
      {list.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cn(
            'pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm shadow-lg',
            t.kind === 'error' && 'bg-rose-50 text-rose-900 ring-1 ring-rose-200',
            t.kind === 'success' && 'bg-brand-50 text-brand-800 ring-1 ring-brand-200',
            t.kind === 'info' && 'bg-white text-stone-800 ring-1 ring-stone-200',
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
