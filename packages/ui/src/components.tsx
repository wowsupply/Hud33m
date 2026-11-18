import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from './utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' && 'px-3 py-1.5 text-sm',
        size === 'md' && 'px-4 py-2.5 text-[15px]',
        size === 'lg' && 'w-full px-5 py-3.5 text-base',
        variant === 'primary' && 'bg-brand-600 text-white shadow-sm hover:bg-brand-700',
        variant === 'secondary' && 'bg-white text-stone-800 ring-1 ring-stone-200 hover:bg-stone-50',
        variant === 'ghost' && 'text-brand-700 hover:bg-brand-50',
        variant === 'danger' && 'bg-white text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50',
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70', className)} {...props}>
      {children}
    </div>
  );
}

/** Если ширина задана снаружи (w-32, max-w-xs, flex-1), не добавляем w-full — иначе классы конфликтуют. */
const hasWidth = (className?: string) => !!className && /(^|\s)(w-|flex-1)/.test(className);

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        !hasWidth(className) && 'w-full',
        'rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-[15px] outline-none transition placeholder:text-stone-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-stone-50',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        !hasWidth(className) && 'w-full',
        'rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-[15px] outline-none transition placeholder:text-stone-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100',
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="mb-1.5 block text-sm font-medium text-stone-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-stone-500">{hint}</span>}
    </label>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin text-current', className ?? 'h-5 w-5')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-brand-600">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'brand' | 'warm' | 'info' | 'danger'; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        tone === 'neutral' && 'bg-stone-100 text-stone-700',
        tone === 'brand' && 'bg-brand-100 text-brand-800',
        tone === 'warm' && 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
        tone === 'info' && 'bg-sky-50 text-sky-800',
        tone === 'danger' && 'bg-rose-50 text-rose-800',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'rounded-full px-3.5 py-1.5 text-sm transition',
        selected ? 'bg-brand-600 text-white' : 'bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50',
      )}
    >
      {children}
    </button>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="text-[15px] text-stone-800">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-7 w-12 shrink-0 rounded-full transition',
          checked ? 'bg-brand-600' : 'bg-stone-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition',
            checked ? 'left-[22px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="text-base font-medium text-stone-800">{title}</p>
      {text && <p className="text-sm text-stone-500">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Нижняя панель (на телефоне) / модальное окно (на компьютере). */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-stone-900/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'max-h-[90vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-stone-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Закрыть">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{children}</h2>
      {action}
    </div>
  );
}
