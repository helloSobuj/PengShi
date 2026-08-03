'use client';

import { useLocale } from 'next-intl';
import { GlobeIcon } from '@phosphor-icons/react';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { cn } from '@/lib/shadcn/utils';

export function LangToggle() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  function switchLocale(next: string) {
    router.replace(pathname, { locale: next as typeof locale });
  }

  return (
    <div className="flex items-center gap-1">
      <GlobeIcon size={16} weight="bold" className="text-foreground/60" />
      {routing.locales.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchLocale(l)}
          className={cn(
            'font-mono text-[10px] font-bold tracking-wider uppercase transition-opacity',
            l === locale ? 'text-foreground opacity-100' : 'text-foreground/40 hover:opacity-70'
          )}
        >
          {l === 'en' ? 'EN' : '中文'}
        </button>
      ))}
    </div>
  );
}
