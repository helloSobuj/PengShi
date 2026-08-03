'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { AppConfig } from '@/app-config';
import { McpConnectorsPanel } from '@/components/app/mcp-connectors-panel';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface SettingsPanelProps {
  appConfig: AppConfig;
}

export function SettingsPanel({ appConfig }: SettingsPanelProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const modelMode = appConfig.modelMode ?? 'inference';

  return (
    <div className="fixed top-4 right-4 z-50">
      <Button
        variant="outline"
        size="sm"
        className="rounded-full font-mono text-[10px] tracking-wider uppercase"
        onClick={() => setOpen((v) => !v)}
      >
        {t('common.settings')}
      </Button>

      {open && (
        <div className="bg-popover text-popover-foreground border-border mt-2 max-h-[80vh] w-80 overflow-y-auto rounded-xl border p-4 shadow-lg">
          <h2 className="text-sm font-semibold">{t('settings.title')}</h2>
          <p className="text-muted-foreground mt-1 text-xs leading-5">
            {t('settings.description')}
          </p>

          <dl className="mt-4 space-y-3 text-xs">
            <div>
              <dt className="text-muted-foreground">{t('settings.modelMode')}</dt>
              <dd className="mt-0.5 font-mono font-medium">{modelMode}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('settings.agentName')}</dt>
              <dd className="mt-0.5 font-mono font-medium">{appConfig.agentName ?? 'auto'}</dd>
            </div>
          </dl>

          <p className="text-muted-foreground mt-4 text-xs leading-5">
            {t('settings.byokHint')}
          </p>

          <Separator className="my-4" />

          <McpConnectorsPanel />

          <Separator className="my-4" />

          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href="/history">{t('settings.history')}</Link>
          </Button>

          <Button asChild variant="outline" size="sm" className="mt-2 w-full">
            <Link href="/admin">{t('settings.adminPanel')}</Link>
          </Button>

          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={() => setOpen(false)}>
            {t('common.close')}
          </Button>
        </div>
      )}
    </div>
  );
}
