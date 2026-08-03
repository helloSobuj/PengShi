import { ReactNode, useEffect } from 'react';
import { toast as sonnerToast } from 'sonner';
import { useAgent, useSessionContext } from '@livekit/components-react';
import { WarningIcon } from '@phosphor-icons/react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ToastProps {
  title: ReactNode;
  description: ReactNode;
}

function toastAlert(toast: ToastProps) {
  const { title, description } = toast;

  return sonnerToast.custom(
    (id) => (
      <Alert onClick={() => sonnerToast.dismiss(id)} className="bg-accent w-full md:w-[364px]">
        <WarningIcon weight="bold" />
        <AlertTitle>{title}</AlertTitle>
        {description && <AlertDescription>{description}</AlertDescription>}
      </Alert>
    ),
    { duration: 10_000 }
  );
}

export function useAgentErrors() {
  const agent = useAgent();
  const { isConnected, end } = useSessionContext();

  useEffect(() => {
    if (isConnected && agent.state === 'failed') {
      const reasons = agent.failureReasons;
      const hasAgentNotJoin = reasons.some(
        (r) =>
          typeof r === 'string' &&
          (r.toLowerCase().includes('did not join') ||
            r.toLowerCase().includes('not join') ||
            r.toLowerCase().includes('agent not'))
      );

      toastAlert({
        title: 'Session ended',
        description: (
          <>
            {reasons.length > 1 && (
              <ul className="list-inside list-disc">
                {reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
            {reasons.length === 1 && <p className="w-full">{reasons[0]}</p>}
            {hasAgentNotJoin && (
              <div className="bg-background/50 mt-2 w-full space-y-1 rounded-md p-2 text-left text-[11px] leading-5">
                <p className="font-semibold">Troubleshooting checklist:</p>
                <ol className="list-inside list-decimal pl-1">
                  <li>
                    Run{' '}
                    <code className="bg-background rounded px-1 font-mono">lk agent status</code> —
                    confirm the agent shows <span className="font-semibold">Running</span>.
                  </li>
                  <li>
                    If stopped, redeploy with{' '}
                    <code className="bg-background rounded px-1 font-mono">lk agent deploy</code>.
                  </li>
                  <li>
                    Verify <code className="bg-background rounded px-1 font-mono">LIVEKIT_URL</code>
                    /keys in Vercel env vars belong to the <em>same</em> LiveKit Cloud project as
                    the deployed agent.
                  </li>
                  <li>
                    Check that{' '}
                    <code className="bg-background rounded px-1 font-mono">
                      AGENT_NAME=echo-agent
                    </code>{' '}
                    matches{' '}
                    <code className="bg-background rounded px-1 font-mono">
                      @server.rtc_session(agent_name="echo-agent")
                    </code>{' '}
                    in agent.py.
                  </li>
                </ol>
              </div>
            )}
            {!hasAgentNotJoin && (
              <p className="w-full">
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href="https://docs.livekit.io/agents/start/voice-ai/"
                  className="whitespace-nowrap underline"
                >
                  See quickstart guide
                </a>
                .
              </p>
            )}
          </>
        ),
      });

      end();
    }
  }, [agent, isConnected, end]);
}
