import type { ConsentType } from '@hud/shared';
import { Button, Card, errorMessage, PageLoader, toast } from '@hud/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMe } from '../components/AppShell';
import { useTRPC } from '../lib/trpc';

export function ConsentsPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useMe();
  const docs = useQuery(trpc.me.consentDocs.queryOptions());
  const [selected, setSelected] = useState<Set<ConsentType>>(new Set());

  useEffect(() => {
    if (docs.data) setSelected(new Set(docs.data.filter((d) => me.consents?.[d.type].accepted || d.type === 'ai_processing').map((d) => d.type)));
  }, [docs.data, me.consents]);

  const accept = useMutation(
    trpc.me.acceptConsents.mutationOptions({
      onSuccess: async () => {
        await qc.invalidateQueries({ queryKey: trpc.me.get.queryKey() });
        navigate(me.onboarded ? '/' : '/onboarding', { replace: true });
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    }),
  );

  if (docs.isPending) return <PageLoader />;
  const list = docs.data ?? [];
  const requiredOk = list.filter((d) => d.required).every((d) => selected.has(d.type));
  const toggle = (t: ConsentType) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-semibold text-stone-900">Перед началом</h1>
      <p className="mt-2 text-[15px] text-stone-600">
        В дневнике будут сведения о весе, питании и самочувствии. Пожалуйста, ознакомьтесь с согласиями.
      </p>
      <div className="mt-5 flex flex-col gap-3">
        {list.map((d) => (
          <Card key={d.type} className="cursor-pointer" onClick={() => toggle(d.type)}>
            <div className="flex gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 accent-brand-600"
                checked={selected.has(d.type)}
                onChange={() => toggle(d.type)}
                onClick={(e) => e.stopPropagation()}
                aria-label={d.title}
              />
              <div>
                <div className="font-medium text-stone-900">
                  {d.title}
                  {d.required ? <span className="text-rose-600"> *</span> : <span className="text-sm font-normal text-stone-500"> (по желанию)</span>}
                </div>
                <p className="mt-1 text-sm leading-relaxed text-stone-600">{d.text}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-xs text-stone-500">* — обязательно для ведения дневника.</p>
      <Button size="lg" className="mt-5" disabled={!requiredOk} loading={accept.isPending} onClick={() => accept.mutate({ types: [...selected] })}>
        Продолжить
      </Button>
    </div>
  );
}
