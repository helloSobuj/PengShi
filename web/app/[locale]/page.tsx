import { headers } from 'next/headers';
import { App } from '@/components/app/app';
import { PortfolioShell } from '@/components/app/portfolio-shell';
import { getAppConfig } from '@/lib/utils';

export default async function Page() {
  const hdrs = await headers();
  const appConfig = await getAppConfig(hdrs);

  return (
    <PortfolioShell>
      <App appConfig={appConfig} />
    </PortfolioShell>
  );
}
