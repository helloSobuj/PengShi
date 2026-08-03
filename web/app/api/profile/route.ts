import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

export const revalidate = 0;

const DEFAULT_PROFILE_PATH = path.resolve(process.cwd(), '..', 'agent', 'data', 'profile.json');

export type ProfileBullet = {
  id: string;
  label: string;
  detail: string;
};

export type ProfileProjectLink = {
  label: string;
  href: string;
};

export type ProfileProject = {
  id: string;
  title: string;
  tagline: string;
  summary: string;
  tech: string[];
  highlights: string[];
  links: ProfileProjectLink[];
};

export type ProfileTechGroup = {
  category: string;
  items: string[];
};

export type ProfileInterviewQA = {
  id: string;
  q: string;
  a: string;
};

export type Profile = {
  name: string;
  role: string;
  preferences?: string;
  about_bio: string;
  about_bullets: ProfileBullet[];
  projects: ProfileProject[];
  tech_stack: ProfileTechGroup[];
  interview_qa: ProfileInterviewQA[];
};

const FALLBACK: Profile = {
  name: '',
  role: 'AI Engineering Intern',
  about_bio:
    'I ship real AI features end-to-end. Ask me anything about this portfolio — the code is on GitHub.',
  about_bullets: [
    {
      id: 'curious',
      label: 'Curious',
      detail: 'I dig into how things work rather than accepting abstractions.',
    },
    {
      id: 'shipping',
      label: 'Shipping',
      detail: 'I prefer working demos to slide decks — this whole site proves it.',
    },
    {
      id: 'communicator',
      label: 'Clear communicator',
      detail: 'Comfortable translating technical trade-offs into English and 中文.',
    },
  ],
  projects: [],
  tech_stack: [],
  interview_qa: [],
};

function sanitize(input: unknown): Profile {
  const fb = FALLBACK;
  if (!input || typeof input !== 'object') return fb;
  const o = input as Record<string, unknown>;

  const toBullets = (v: unknown): ProfileBullet[] => {
    if (!Array.isArray(v)) return fb.about_bullets;
    return v
      .map((b) => {
        if (!b || typeof b !== 'object') return null;
        const x = b as Record<string, unknown>;
        return {
          id: String(x.id ?? ''),
          label: String(x.label ?? ''),
          detail: String(x.detail ?? ''),
        } satisfies ProfileBullet;
      })
      .filter((b): b is ProfileBullet => Boolean(b && b.id && b.label));
  };

  const toProjects = (v: unknown): ProfileProject[] => {
    if (!Array.isArray(v)) return fb.projects;
    return v
      .map((p) => {
        if (!p || typeof p !== 'object') return null;
        const x = p as Record<string, unknown>;
        return {
          id: String(x.id ?? ''),
          title: String(x.title ?? ''),
          tagline: String(x.tagline ?? ''),
          summary: String(x.summary ?? ''),
          tech: Array.isArray(x.tech) ? (x.tech as string[]).map(String) : [],
          highlights: Array.isArray(x.highlights) ? (x.highlights as string[]).map(String) : [],
          links: Array.isArray(x.links)
            ? x.links
                .map((l: unknown) => {
                  if (!l || typeof l !== 'object') return null;
                  const y = l as Record<string, unknown>;
                  return {
                    label: String(y.label ?? ''),
                    href: String(y.href ?? ''),
                  } satisfies ProfileProjectLink;
                })
                .filter((l): l is ProfileProjectLink => Boolean(l && l.label && l.href))
            : [],
        } satisfies ProfileProject;
      })
      .filter((p): p is ProfileProject => Boolean(p && p.id && p.title));
  };

  const toTech = (v: unknown): ProfileTechGroup[] => {
    if (!Array.isArray(v)) return fb.tech_stack;
    return v
      .map((g) => {
        if (!g || typeof g !== 'object') return null;
        const x = g as Record<string, unknown>;
        return {
          category: String(x.category ?? ''),
          items: Array.isArray(x.items) ? (x.items as string[]).map(String) : [],
        } satisfies ProfileTechGroup;
      })
      .filter((g): g is ProfileTechGroup => Boolean(g && g.category));
  };

  const toQA = (v: unknown): ProfileInterviewQA[] => {
    if (!Array.isArray(v)) return fb.interview_qa;
    return v
      .map((q) => {
        if (!q || typeof q !== 'object') return null;
        const x = q as Record<string, unknown>;
        return {
          id: String(x.id ?? ''),
          q: String(x.q ?? ''),
          a: String(x.a ?? ''),
        } satisfies ProfileInterviewQA;
      })
      .filter((qa): qa is ProfileInterviewQA => Boolean(qa && qa.id && qa.q));
  };

  return {
    name: String(o.name ?? fb.name),
    role: String(o.role ?? fb.role),
    preferences: typeof o.preferences === 'string' ? o.preferences : undefined,
    about_bio: String(o.about_bio ?? fb.about_bio),
    about_bullets: toBullets(o.about_bullets),
    projects: toProjects(o.projects),
    tech_stack: toTech(o.tech_stack),
    interview_qa: toQA(o.interview_qa),
  };
}

export async function GET() {
  try {
    const filePath = process.env.AGENT_PROFILE_PATH || DEFAULT_PROFILE_PATH;
    let raw: unknown;
    if (fs.existsSync(filePath)) {
      raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else {
      raw = null;
    }
    const profile = sanitize(raw);
    return NextResponse.json({ ok: true, profile, source: raw ? 'file' : 'fallback' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg, profile: sanitize(null) }, { status: 500 });
  }
}
