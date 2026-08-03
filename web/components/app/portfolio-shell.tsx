'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Profile, ProfileInterviewQA } from '@/app/api/profile/route';
import { LangToggle } from '@/components/app/lang-toggle';
// ---- mini toggles: re-export wrappers so existing components/app/theme-toggle + lang-toggle work here
import { ThemeToggle } from '@/components/app/theme-toggle';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { Link as IntlLink } from '@/i18n/navigation';
import { cn } from '@/lib/shadcn/utils';

type NavKey = 'about' | 'projects' | 'tech' | 'interview';

interface ProfileResponse {
  ok: boolean;
  error?: string;
  profile: Profile;
  source?: 'file' | 'fallback';
}

const NAV: Array<{ key: NavKey; label: 'navAbout' | 'navProjects' | 'navTech' | 'navInterview' }> =
  [
    { key: 'about', label: 'navAbout' },
    { key: 'projects', label: 'navProjects' },
    { key: 'tech', label: 'navTech' },
    { key: 'interview', label: 'navInterview' },
  ];

const FALLBACK: Profile = {
  name: '',
  role: 'AI Engineering Intern',
  about_bio:
    'I build and ship real AI features end-to-end. Ask Echo on the right anything about me.',
  about_bullets: [],
  projects: [],
  tech_stack: [],
  interview_qa: [],
};

export function PortfolioShell({ children }: { children: React.ReactNode }) {
  const t = useTranslations('portfolio');
  const ts = useTranslations('settings');

  const [resp, setResp] = useState<ProfileResponse>({
    ok: true,
    profile: FALLBACK,
    source: 'fallback',
  });
  const [loading, setLoading] = useState(true);
  const [activeNav, setActiveNav] = useState<NavKey>('about');
  const [openQA, setOpenQA] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const r = await fetch('/api/profile', { cache: 'no-store' });
        const data = (await r.json()) as ProfileResponse;
        if (cancelled) return;
        setResp({
          ok: r.ok && data.ok,
          error: r.ok ? data.error : `HTTP ${r.status}`,
          profile: data.profile ?? FALLBACK,
          source: data.source,
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setResp({ ok: false, error: msg, profile: FALLBACK, source: 'fallback' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const profile = resp.profile;

  const scrollTo = useCallback((key: NavKey) => {
    const el = document.getElementById(`section-${key}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveNav(key);
  }, []);

  // IntersectionObserver for nav highlight
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return undefined;
    const sections = NAV.map((n) => document.getElementById(`section-${n.key}`)).filter(
      (e): e is HTMLElement => Boolean(e)
    );
    if (!sections.length) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const k = entry.target.id.replace('section-', '') as NavKey;
            setActiveNav(k);
          }
        });
      },
      {
        rootMargin: '-30% 0px -60% 0px',
        threshold: 0,
      }
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  const roleName = useMemo(() => {
    if (!resp.profile.name && profile.role) return `${profile.name} · ${profile.role}`;
    return profile.role ?? 'AI Engineering Intern';
  }, [profile.name, profile.role, resp.profile.name]);

  return (
    <div className="grid h-svh grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Left: portfolio content column */}
      <aside
        aria-label={t('splitAriaPortfolio')}
        className="bg-background/50 relative h-full min-h-0 overflow-y-auto border-r backdrop-blur-sm"
      >
        <div className="bg-background/80 sticky top-0 z-10 flex flex-col gap-3 border-b px-6 py-4 backdrop-blur">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
                Portfolio
              </p>
              <h1 className="mt-1 text-xl leading-tight font-semibold">{roleName}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggleMini />
              <LangToggleMini />
            </div>
          </div>

          <p className="bg-muted/40 text-foreground mt-1 rounded-lg p-3 text-xs leading-5">
            {t('heroGreeting')}
          </p>
          <p className="text-muted-foreground mt-1 text-xs leading-5">{t('heroCta')}</p>

          {!resp.ok && resp.error ? (
            <p className="border-destructive/40 bg-destructive/10 text-destructive mt-3 rounded-md border p-2 text-[11px]">
              {t('profileError')} <span className="font-mono opacity-80">{resp.error}</span>
            </p>
          ) : null}

          <nav className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {NAV.map((n) => (
              <button
                key={n.key}
                type="button"
                onClick={() => scrollTo(n.key)}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors',
                  activeNav === n.key
                    ? 'border-primary/60 bg-primary/10 text-primary shadow-sm'
                    : 'border-border bg-background hover:bg-accent/30 hover:text-accent-foreground'
                )}
              >
                {t(n.label)}
              </button>
            ))}
            <Separator orientation="vertical" className="mx-1 h-5" />
            <IntlLink
              href="/history"
              className="border-border bg-background text-muted-foreground hover:bg-accent/30 hover:text-accent-foreground rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              {t('navHistory')}
            </IntlLink>
            <IntlLink
              href="/knowledge-base"
              className="border-border bg-background text-muted-foreground hover:bg-accent/30 hover:text-accent-foreground rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              {t('navKB')}
            </IntlLink>
            <IntlLink
              href="/admin"
              className="border-border bg-background text-muted-foreground hover:bg-accent/30 hover:text-accent-foreground rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              {ts('adminPanel')}
            </IntlLink>
          </nav>
        </div>

        <div className="space-y-8 px-6 py-6">
          {/* About section */}
          <section id="section-about" className="scroll-mt-28 space-y-3">
            <SectionHeader title={t('aboutTitle')} subtitle={t('aboutSubtitle')} />
            <p className="text-foreground text-sm leading-6">{profile.about_bio}</p>
            {profile.about_bullets.length ? (
              <ul className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {profile.about_bullets.map((b) => (
                  <li key={b.id} className="bg-card rounded-lg border p-3 shadow-sm">
                    <p className="text-sm font-semibold">{b.label}</p>
                    <p className="text-muted-foreground mt-1 text-xs leading-5">{b.detail}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <Separator />

          {/* Projects */}
          <section id="section-projects" className="scroll-mt-28 space-y-3">
            <SectionHeader title={t('projectsTitle')} subtitle={t('projectsSubtitle')} />
            {loading ? (
              <p className="text-muted-foreground text-xs">{t('navAbout')}</p>
            ) : profile.projects.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-xs">
                Add projects to agent/data/profile.json
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {profile.projects.map((p) => (
                  <article
                    key={p.id}
                    className="bg-card rounded-xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="text-base font-semibold">{p.title}</h3>
                        <p className="text-primary/90 mt-0.5 text-xs font-medium">{p.tagline}</p>
                      </div>
                      {p.links.length ? (
                        <div className="flex flex-wrap gap-2">
                          {p.links.map((l) =>
                            l.href.startsWith('/') ? (
                              <IntlLink
                                key={l.href}
                                href={l.href as never}
                                className="border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                              >
                                {l.label}
                              </IntlLink>
                            ) : (
                              <a
                                key={l.href}
                                href={l.href}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 rounded-md border px-2.5 py-1 text-[11px] font-semibold"
                              >
                                {l.label} ↗
                              </a>
                            )
                          )}
                        </div>
                      ) : null}
                    </div>
                    <p className="text-foreground mt-3 text-xs leading-5">{p.summary}</p>

                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {p.tech.length ? (
                        <div>
                          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wider uppercase">
                            {t('projectTech')}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {p.tech.map((x) => (
                              <span
                                key={x}
                                className="bg-muted/40 text-muted-foreground rounded-full border px-2 py-0.5 text-[10px] font-medium"
                              >
                                {x}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {p.highlights.length ? (
                        <div>
                          <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-wider uppercase">
                            {t('projectHighlights')}
                          </p>
                          <ul className="text-foreground list-disc space-y-0.5 pl-4 text-[11px] leading-5">
                            {p.highlights.map((h, i) => (
                              <li key={`${p.id}-hl-${i}`}>{h}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* Tech stack */}
          <section id="section-tech" className="scroll-mt-28 space-y-3">
            <SectionHeader title={t('techTitle')} subtitle={t('techSubtitle')} />
            {profile.tech_stack.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-xs">
                Add tech_stack entries in agent/data/profile.json
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {profile.tech_stack.map((g) => (
                  <div key={g.category} className="bg-card rounded-lg border p-3">
                    <p className="text-muted-foreground mb-2 text-[10px] font-semibold tracking-wider uppercase">
                      {g.category}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {g.items.map((x) => (
                        <span
                          key={x}
                          className="bg-background text-foreground rounded-md border px-2 py-0.5 text-[11px] font-medium"
                        >
                          {x}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <Separator />

          {/* Interview QA */}
          <section id="section-interview" className="scroll-mt-28 space-y-3">
            <SectionHeader title={t('interviewTitle')} subtitle={t('interviewSubtitle')} />
            {profile.interview_qa.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-xs">
                Add interview_qa in agent/data/profile.json
              </p>
            ) : (
              <div className="space-y-2">
                {profile.interview_qa.map((qa) => (
                  <QACard
                    key={qa.id}
                    qa={qa}
                    open={openQA === qa.id}
                    labelExpand={t('interviewAriaExpand')}
                    labelCollapse={t('interviewAriaCollapse')}
                    onToggle={() => setOpenQA((cur) => (cur === qa.id ? null : qa.id))}
                  />
                ))}
              </div>
            )}
          </section>

          <div className="text-muted-foreground pt-4 pb-10 text-center font-mono text-[10px] tracking-widest uppercase">
            # // built with LiveKit Agents + Next.js
          </div>
        </div>
      </aside>

      {/* Right: Echo voice agent column */}
      <section
        aria-label={t('splitAriaAgent')}
        className="bg-background relative h-svh min-h-0 overflow-hidden"
      >
        {children}
      </section>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-foreground text-sm font-semibold tracking-wider uppercase">{title}</h2>
      {subtitle ? <p className="text-muted-foreground mt-0.5 text-xs">{subtitle}</p> : null}
    </div>
  );
}

function QACard({
  qa,
  open,
  onToggle,
  labelExpand,
  labelCollapse,
}: {
  qa: ProfileInterviewQA;
  open: boolean;
  onToggle: () => void;
  labelExpand: string;
  labelCollapse: string;
}) {
  return (
    <Collapsible open={open} onOpenChange={onToggle} className="bg-card rounded-xl border">
      <CollapsibleTrigger
        aria-label={open ? labelCollapse : labelExpand}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
      >
        <div>
          <p className="text-primary/70 mb-1 font-mono text-[10px] tracking-widest uppercase">Q</p>
          <p className="text-foreground text-sm leading-5 font-semibold">{qa.q}</p>
        </div>
        <span
          aria-hidden
          className={cn(
            'mt-1 shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold transition-transform',
            open && 'rotate-45'
          )}
        >
          +
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="bg-muted/20 border-t px-4 py-3">
          <p className="mb-1 font-mono text-[10px] tracking-widest text-emerald-600/90 uppercase dark:text-emerald-300/90">
            A
          </p>
          <p className="text-foreground text-xs leading-6 whitespace-pre-wrap">{qa.a}</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ThemeToggleMini() {
  return <ThemeToggle className="w-auto" />;
}
function LangToggleMini() {
  return <LangToggle />;
}
