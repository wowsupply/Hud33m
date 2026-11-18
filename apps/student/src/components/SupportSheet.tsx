import { Button, Sheet } from '@hud/ui';
import type { RouterOutputs } from '../lib/trpc';

export type SafetyInfo = NonNullable<RouterOutputs['diary']['createMeal']['safety']>;

/** Бережное сообщение при тревожных сигналах в тексте (протокол согласует специалист). */
export function SupportSheet({ info, onClose }: { info: SafetyInfo | null; onClose: () => void }) {
  return (
    <Sheet open={!!info} onClose={onClose} title={info?.title ?? ''}>
      {info && (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed text-stone-700">{info.text}</p>
          {info.contacts.map((c) => (
            <a
              key={c.phone}
              href={`tel:${c.phone}`}
              className="flex items-center justify-between rounded-2xl bg-brand-50 px-4 py-3 text-brand-900 ring-1 ring-brand-100"
            >
              <span>{c.label}</span>
              <span className="text-lg font-semibold">{c.phone}</span>
            </a>
          ))}
          <Button size="lg" onClick={onClose}>
            Понятно
          </Button>
        </div>
      )}
    </Sheet>
  );
}
