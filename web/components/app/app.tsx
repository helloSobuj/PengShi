'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { TokenSource } from 'livekit-client';
import { useSession } from '@livekit/components-react';
import { WarningIcon } from '@phosphor-icons/react/dist/ssr';
import type { AppConfig } from '@/app-config';
import { AgentSessionProvider } from '@/components/agents-ui/agent-session-provider';
import { StartAudioButton } from '@/components/agents-ui/start-audio-button';
import { SettingsPanel } from '@/components/app/settings-panel';
import { ViewController } from '@/components/app/view-controller';
import { Toaster } from '@/components/ui/sonner';
import { useAgentErrors } from '@/hooks/useAgentErrors';
import { useDebugMode } from '@/hooks/useDebug';
import { loadMcpServersFromStorage } from '@/lib/mcp-connectors';
import { getSandboxTokenSource } from '@/lib/utils';

const IN_DEVELOPMENT = process.env.NODE_ENV !== 'production';
const USE_SANDBOX =
  process.env.NEXT_PUBLIC_USE_SANDBOX === 'true' &&
  Boolean(process.env.NEXT_PUBLIC_SANDBOX_ID || process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT);

function AppSetup() {
  useDebugMode({ enabled: IN_DEVELOPMENT });
  useAgentErrors();

  return null;
}

interface AppProps {
  appConfig: AppConfig;
}

function createEchoTokenSource(appConfig: AppConfig) {
  return TokenSource.custom(async () => {
    const roomConfig = appConfig.agentName
      ? { agents: [{ agent_name: appConfig.agentName }] }
      : undefined;
    const mcp_servers = loadMcpServersFromStorage();
    const res = await fetch('/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_config: roomConfig, mcp_servers }),
    });
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return await res.json();
  });
}

function createTokenSource(appConfig: AppConfig) {
  // Optional sandbox path for local experimentation
  if (USE_SANDBOX) {
    if (process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT) {
      return getSandboxTokenSource(appConfig);
    }
    if (process.env.NEXT_PUBLIC_SANDBOX_ID) {
      return TokenSource.sandboxTokenServer(process.env.NEXT_PUBLIC_SANDBOX_ID);
    }
  }

  return createEchoTokenSource(appConfig);
}

export function App({ appConfig }: AppProps) {
  const t = useTranslations('audio');
  const tokenSource = useMemo(() => createTokenSource(appConfig), [appConfig]);

  const session = useSession(
    tokenSource,
    appConfig.agentName ? { agentName: appConfig.agentName } : undefined
  );

  return (
    <AgentSessionProvider session={session}>
      <AppSetup />
      <SettingsPanel appConfig={appConfig} />
      <main className="grid h-svh grid-cols-1 place-content-center">
        <ViewController appConfig={appConfig} />
      </main>
      <StartAudioButton label={t('start')} />
      <Toaster
        icons={{
          warning: <WarningIcon weight="bold" />,
        }}
        position="top-center"
        className="toaster group"
        style={
          {
            '--normal-bg': 'var(--popover)',
            '--normal-text': 'var(--popover-foreground)',
            '--normal-border': 'var(--border)',
          } as React.CSSProperties
        }
      />
    </AgentSessionProvider>
  );
}
