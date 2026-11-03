import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ClerkProvider, Show, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  getGetPlanQueryKey,
  getGetRunQueryKey,
  getListPlansQueryKey,
  getListRunsQueryKey,
  useGetPlan,
  useGetRun,
  useListPlans,
  useListRuns,
  useMarkChecklistShown,
  useUpdatePlanItem,
} from '@workspace/api-client-react';
import type { PlanDetail, PlanSummary, RunDetail, RunEvent, RunSummary } from '@workspace/api-client-react';
import {
  Activity, ArrowDown, ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CheckCircle2,
  ChevronDown, Circle, Clock3, ExternalLink, FileText, LoaderCircle, LogOut, Pause, Play,
  RotateCcw, Sparkles, X,
} from 'lucide-react';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation, useParams } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const apiRoot = `${basePath}/api`.replace(/^\/\//, '/');

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: '#346b5d',
    colorForeground: '#263b35',
    colorMutedForeground: '#73817b',
    colorDanger: '#bd554e',
    colorBackground: '#fffdf7',
    colorInput: '#fffdf7',
    colorInputForeground: '#263b35',
    colorNeutral: '#d9d8ca',
    fontFamily: 'DM Sans, sans-serif',
    borderRadius: '12px',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffdf7] rounded-2xl w-[440px] max-w-full overflow-hidden shadow-[0_22px_70px_rgba(39,61,54,.13)]',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#263b35] font-semibold',
    headerSubtitle: 'text-[#73817b]',
    socialButtonsBlockButtonText: 'text-[#263b35]',
    formFieldLabel: 'text-[#344c43]',
    footerActionLink: 'text-[#346b5d]',
    footerActionText: 'text-[#73817b]',
    dividerText: 'text-[#73817b]',
    identityPreviewEditButton: 'text-[#346b5d]',
    formFieldSuccessText: 'text-[#346b5d]',
    alertText: 'text-[#9e4742]',
    logoBox: 'rounded-xl',
    logoImage: 'rounded-xl',
    socialButtonsBlockButton: 'border-[#d9d8ca] bg-[#fffdf7] rounded-xl',
    formButtonPrimary: 'bg-[#346b5d] hover:bg-[#28584c] text-[#fffdf7] rounded-xl',
    formFieldInput: 'bg-[#fffdf7] border-[#d9d8ca] rounded-xl text-[#263b35]',
    footerAction: 'text-[#73817b]',
    dividerLine: 'bg-[#e8e4d8]',
    alert: 'bg-[#faeeeb] border-[#e9c6c0]',
    otpCodeFieldInput: 'border-[#d9d8ca] rounded-lg',
    formFieldRow: 'text-[#344c43]',
    main: 'text-[#263b35]',
  },
};

type LiveEvent = Partial<RunEvent> & { event?: Partial<RunEvent>; stepName?: string; layer?: string; runId?: string; planId?: string; type?: string; done?: boolean; error?: string; status?: string; detail?: string };

function LandingPage() {
  return (
    <main className="paper-grain min-h-[100dvh] overflow-hidden bg-[#f5f2e8] text-[#263b35]">
      <header className="relative z-10 mx-auto flex max-w-[1240px] items-center justify-between px-6 py-6 md:px-10">
        <Link href="/" className="focus-ring flex items-center gap-3 rounded-lg" data-testid="link-brand">
          <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#346b5d] text-[#f8f3e6]"><BookOpen size={19} /></span>
          <span className="font-serif text-[21px] font-semibold tracking-[-.03em]">Little by little</span>
        </Link>
        <nav className="flex items-center gap-3">
          <Link href="/sign-in" className="focus-ring rounded-full px-4 py-2.5 text-sm font-semibold text-[#53645d] hover:text-[#263b35]" data-testid="link-sign-in">Sign in</Link>
          <Link href="/sign-up" className="focus-ring rounded-full bg-[#346b5d] px-5 py-2.5 text-sm font-semibold text-[#fffdf7] shadow-sm transition-transform hover:-translate-y-0.5" data-testid="link-get-started">Make a plan <ArrowRight className="ml-1 inline" size={15} /></Link>
        </nav>
      </header>
      <section className="relative mx-auto grid max-w-[1240px] items-center gap-14 px-6 pb-20 pt-10 md:grid-cols-[1.05fr_.95fr] md:px-10 md:pb-28 md:pt-16">
        <div className="fade-up relative z-10">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#d6dacd] bg-[#f9f7ef] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[.14em] text-[#557568]"><span className="h-2 w-2 rounded-full bg-[#d78569]" /> A calmer kind of test prep</div>
          <h1 className="max-w-[700px] font-serif text-[clamp(3.2rem,7.2vw,6.3rem)] leading-[.94] tracking-[-.055em]">A big syllabus,<br /><em className="font-medium text-[#c4765b]">one small day</em><br />at a time.</h1>
          <p className="mt-7 max-w-[490px] text-[17px] leading-8 text-[#65736d]">Turn school notes into a gentle, doable Grade 1 practice plan—with the steps kept in view, from first paste to finished checklist.</p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link href="/sign-up" className="focus-ring group inline-flex items-center gap-3 rounded-full bg-[#346b5d] px-6 py-4 text-[15px] font-semibold text-[#fffdf7] shadow-[0_12px_30px_rgba(52,107,93,.2)] transition-transform hover:-translate-y-1" data-testid="link-start-plan">Build a practice plan <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" /></Link>
            <span className="text-sm text-[#718078]">No perfect notes required.</span>
          </div>
          <div className="mt-14 flex items-center gap-5 border-t border-[#d9dacf] pt-5 text-xs text-[#73817b]">
            <div className="flex -space-x-2"><span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f5f2e8] bg-[#e7c6a8] font-bold text-[#654f40]">P</span><span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#f5f2e8] bg-[#d4ddd0] font-bold text-[#426155]">K</span></div>
            <span>Made for the kitchen table, together.</span><span className="ml-auto hidden items-center gap-2 font-mono text-[10px] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#77a18a]" /> PLAN AT YOUR PACE</span>
          </div>
        </div>
        <div className="fade-up relative mx-auto w-full max-w-[520px] [animation-delay:120ms]">
          <div className="absolute -right-8 -top-4 h-36 w-36 rounded-full bg-[#edcf9f]/70 blur-2xl" />
          <div className="absolute -bottom-8 -left-10 h-40 w-40 rounded-full bg-[#d8e1d4]/80 blur-2xl" />
          <div className="relative rotate-[1.2deg] rounded-[28px] border border-[#e1dfd3] bg-[#fffdf7] p-5 shadow-[0_28px_70px_rgba(58,75,65,.14)] sm:p-7">
            <div className="flex items-center justify-between border-b border-[#eeece2] pb-4">
              <div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-[#8d9b8f]">Your little plan</div><div className="mt-1 font-serif text-xl">Ready for Grade 1</div></div>
              <div className="rounded-full bg-[#e8f0e6] px-3 py-1.5 text-xs font-semibold text-[#48725e]">6 days left</div>
            </div>
            <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[#f6f5ed] p-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f4dfcf] text-[#b96850]"><CalendarDays size={19} /></span>
              <div><div className="text-sm font-semibold">Tuesday, May 14</div><div className="mt-1 text-xs text-[#7d8981]">A little reading, a little counting</div></div>
              <span className="ml-auto font-mono text-[10px] text-[#a2a99f]">DAY 03</span>
            </div>
            <div className="mt-5 space-y-3">
              {[
                ['Reading', 'Spot the beginning sound', true],
                ['Math', 'Make 10 with two groups', false],
                ['Writing', 'Write a sentence about spring', false],
              ].map(([subject, topic, checked], i) => (
                <div key={String(subject)} className={`flex items-center gap-3 rounded-xl border p-3.5 ${checked ? 'border-[#e4e8dd] bg-[#f5f7f0]' : 'border-[#efeee7] bg-[#fffefa]'}`}>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked ? 'border-[#4f806b] bg-[#4f806b] text-white' : 'border-[#c9d0c5]'}`}>{checked && <Check size={13} />}</span>
                  <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#9a806c]">{subject}</div><div className={`mt-0.5 truncate text-sm font-medium ${checked ? 'text-[#819087] line-through' : 'text-[#354a41]'}`}>{topic}</div></div>
                  <span className="font-mono text-[10px] text-[#aab0a4]">0{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-[#eeece2] pt-4">
              <div className="flex items-center gap-2 text-xs text-[#75847a]"><span className="h-2 w-2 rounded-full bg-[#74a083]" /> 4 of 12 complete</div>
              <div className="h-2 w-[108px] overflow-hidden rounded-full bg-[#e9ebe2]"><div className="h-full w-1/3 rounded-full bg-[#67927b]" /></div>
            </div>
          </div>
          <div className="absolute -left-8 top-1/2 hidden -translate-y-1/2 -rotate-3 rounded-2xl border border-[#e5ddd0] bg-[#f7ebd9] px-4 py-3 shadow-md sm:block"><div className="font-mono text-[9px] uppercase tracking-[.14em] text-[#94795f]">Grown-up approved</div><div className="mt-1 font-serif text-sm text-[#674f3f]">Room to breathe.</div></div>
        </div>
      </section>
      <section className="border-y border-[#e1dfd4] bg-[#ebece2]">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-6 py-12 md:grid-cols-[.7fr_1.3fr] md:px-10 md:py-16">
          <div><div className="font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#9a806c]">The way through</div><h2 className="mt-3 font-serif text-3xl leading-tight tracking-[-.03em]">From the school bag<br />to a little more ready.</h2></div>
          <div className="grid gap-7 sm:grid-cols-3">
            {[['01', 'Drop in the syllabus', 'Paste the note from school. It does not need tidying first.'], ['02', 'See the plan take shape', 'Watch each step as topics become a day-by-day checklist.'], ['03', 'Practice, then tick', 'A short session and a clear finish. That is enough for today.']].map(([n, title, copy]) => <article key={n} className="border-t border-[#d2d8ce] pt-4"><div className="font-mono text-[10px] text-[#c4765b]">{n} / THREE</div><h3 className="mt-3 font-serif text-[19px]">{title}</h3><p className="mt-2 text-sm leading-6 text-[#718078]">{copy}</p></article>)}
          </div>
        </div>
      </section>
      <section className="mx-auto flex max-w-[1240px] flex-col gap-7 px-6 py-12 sm:flex-row sm:items-center sm:justify-between md:px-10 md:py-16">
        <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.14em] text-[#668274]"><Activity size={14} /> Nothing happens behind a curtain</div><h2 className="mt-3 max-w-[550px] font-serif text-3xl tracking-[-.03em]">A plan you can follow.<br />A process you can see.</h2></div>
        <div className="flex max-w-[430px] items-start gap-3 rounded-2xl border border-[#dedfd3] bg-[#fbfaf4] p-5"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f0e1d4] text-[#b96f53]"><FileText size={17} /></span><p className="text-sm leading-6 text-[#697970]">Every run keeps a readable record of its steps—including a pause when a test date is missing, or a note when something needs another try.</p></div>
      </section>
      <footer className="border-t border-[#e1dfd4] px-6 py-6 text-center text-xs text-[#89938b]">Small steps count. So does a little bit of rest.</footer>
    </main>
  );
}

function Header({ compact = false }: { compact?: boolean }) {
  const { signOut } = useClerk();
  const { user } = useUser();
  return <header className={`flex items-center justify-between ${compact ? 'border-b border-[#e7e5db] bg-[#f8f6ef] px-5 py-4 md:px-9' : 'px-6 py-5'}`}>
    <Link href="/" className="focus-ring flex items-center gap-3 rounded-lg" data-testid="link-workspace-home">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#346b5d] text-[#f8f3e6]"><BookOpen size={17} /></span><span className="font-serif text-lg font-semibold">Little by little</span>
    </Link>
    <div className="flex items-center gap-3">
      {user && <span className="hidden text-xs text-[#7a8980] sm:inline">{user.firstName ? `Hi, ${user.firstName}` : 'Your family space'}</span>}
      <button type="button" onClick={() => signOut({ redirectUrl: basePath || '/' })} className="focus-ring flex items-center gap-2 rounded-full border border-[#dedfd3] bg-[#fffdf7] px-3.5 py-2 text-xs font-semibold text-[#64746a] hover:bg-[#f1f2e9]" data-testid="button-sign-out"><LogOut size={14} /> Sign out</button>
    </div>
  </header>;
}

function LoadingBlock({ label = 'Gathering your plans' }: { label?: string }) {
  return <div className="animate-pulse"><div className="h-3 w-24 rounded bg-[#e2e5dc]" /><div className="mt-4 h-9 w-64 max-w-full rounded-lg bg-[#e2e5dc]" /><div className="mt-8 h-48 rounded-[22px] bg-[#e9eae2]" /><span className="sr-only">{label}</span></div>;
}

function StatusChip({ status }: { status: string }) {
  const tones: Record<string, string> = { processing: 'bg-[#f7edd8] text-[#927346]', needs_date: 'bg-[#f7e9df] text-[#a36147]', complete: 'bg-[#e5efe6] text-[#48725e]', partial: 'bg-[#f7edd8] text-[#927346]', failed: 'bg-[#f8e7e4] text-[#a14d46]' };
  const label = status.replace('_', ' ');
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] ${tones[status] || 'bg-[#edf0e8] text-[#68786d]'}`} data-testid={`status-run-${status}`}>{label}</span>;
}

function dateLabel(value?: string) {
  if (!value) return 'Date to be set';
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
function timeLabel(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

function streamApi(path: string, body?: Record<string, string>, signal?: AbortSignal) {
  return fetch(`${apiRoot}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json', Accept: 'text/event-stream' } : { Accept: 'text/event-stream' },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
}

async function readEventStream(response: Response, onEvent: (event: LiveEvent) => void) {
  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `The request could not finish (${response.status}).`);
  }
  if (!response.body) throw new Error('The live progress stream was not available. Please try again.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let streamRunId = response.headers.get('x-run-id') || undefined;
  const consume = (frame: string) => {
    const raw = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
    if (!raw || raw === '[DONE]') return;
    try {
      const parsed = JSON.parse(raw) as LiveEvent;
      const item = (parsed.event && typeof parsed.event === 'object' ? parsed.event : parsed) as LiveEvent;
      const possibleId = parsed.runId || (parsed as { run?: { id?: string } }).run?.id || (parsed.type === 'run' ? parsed.id : undefined);
      if (possibleId) streamRunId = possibleId;
      onEvent({ ...item, runId: item.runId || streamRunId });
    } catch {
      onEvent({ detail: raw, runId: streamRunId });
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() || '';
    frames.forEach(consume);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
  return streamRunId;
}

function ArchitectureMap({ activeStep }: { activeStep?: string }) {
  const layers = [
    { name: 'Page', color: '#c8795d', steps: [['01', 'Note received'], ['09', 'Checklist shown']] },
    { name: 'Server', color: '#6b8c7a', steps: [['03', 'Input checked'], ['05', 'Extraction validated'], ['06', 'Plan built']] },
    { name: 'Database', color: '#bd9b61', steps: [['02', 'Draft saved'], ['08', 'Plan saved']] },
    { name: 'AI', color: '#7f8f9c', steps: [['04', 'Syllabus extracted'], ['07', 'Practice questions']] },
  ];
  return <div className="rounded-[22px] border border-[#e1e3d9] bg-[#fbfaf4] p-4 sm:p-5" data-testid="diagram-run-layers">
    <div className="mb-4 flex items-center justify-between gap-2"><div><div className="font-mono text-[9px] font-medium uppercase tracking-[.16em] text-[#87948b]">The visible path</div><div className="mt-1 font-serif text-lg">9 steps. Nothing hidden.</div></div><span className="hidden rounded-full bg-[#ecf0e8] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.1em] text-[#74867a] sm:inline">Page → AI</span></div>
    <div className="grid gap-2">
      {layers.map(layer => <div key={layer.name} className="grid min-w-0 grid-cols-[70px_minmax(0,1fr)] items-stretch gap-2 sm:grid-cols-[86px_minmax(0,1fr)]">
        <div className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-[10px] font-bold uppercase tracking-[.09em]" style={{ color: layer.color, backgroundColor: `${layer.color}12` }}><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: layer.color }} />{layer.name}</div>
        <div className="flex min-w-0 flex-wrap gap-1.5">
          {layer.steps.map(([number, label]) => <div key={number} className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-[10px] sm:text-[11px] ${activeStep === number || activeStep?.includes(label) ? 'border-[#c2d7c9] bg-[#eef5ed] text-[#3f6b58]' : 'border-[#e9e9e0] bg-white/60 text-[#78867d]'}`} data-testid={`diagram-step-${number}`}>
            <span className="font-mono text-[9px] opacity-60">{number}</span><span className="min-w-0 break-words leading-4">{label}</span>
          </div>)}
        </div>
      </div>)}
    </div>
    <div className="mt-3 flex items-center gap-2 text-[10px] text-[#89958c]"><ArrowDown size={12} /> Each update is kept in the run record below.</div>
  </div>;
}

function EventsPanel({ events, loading = false }: { events: LiveEvent[]; loading?: boolean }) {
  if (loading && !events.length) return <div className="space-y-3 rounded-[22px] border border-[#e1e3d9] bg-[#fbfaf4] p-5"><div className="h-4 w-32 animate-pulse rounded bg-[#e3e6dd]" /><div className="h-12 animate-pulse rounded-lg bg-[#e9ebe3]" /><div className="h-12 animate-pulse rounded-lg bg-[#e9ebe3]" /></div>;
  if (!events.length) return <div className="rounded-[22px] border border-dashed border-[#d9ded3] bg-[#f8f7f0] p-6 text-sm text-[#89958c]">Progress events will appear here as the plan takes shape.</div>;
  return <div className="overflow-hidden rounded-[22px] border border-[#e1e3d9] bg-[#fbfaf4]">
    <div className="flex items-center justify-between border-b border-[#e8e8df] px-4 py-3"><div className="flex items-center gap-2 text-xs font-semibold text-[#53695e]"><Activity size={14} /> Live record <span className="rounded-full bg-[#e8f0e6] px-2 py-0.5 text-[9px] text-[#4c775f]">{events.length} updates</span></div><span className="font-mono text-[9px] uppercase tracking-[.12em] text-[#97a198]">Stored as it happens</span></div>
    <div className="max-h-[390px] divide-y divide-[#efeee7] overflow-auto">
      {events.map((event, i) => {
        const status = event.status || 'started';
        const tone = status === 'finished' ? 'text-[#588167] bg-[#e8f0e6]' : status === 'failed' ? 'text-[#a94f48] bg-[#fae9e5]' : status === 'skipped' ? 'text-[#9a815e] bg-[#f3eddf]' : 'text-[#a8754e] bg-[#f7ede3]';
        const Icon = status === 'finished' ? CheckCircle2 : status === 'failed' ? X : status === 'skipped' ? Circle : LoaderCircle;
        return <div key={event.id || `${event.stepId}-${i}`} className="step-in flex items-start gap-3 px-4 py-3" data-testid={`event-record-${event.id || i}`}>
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${tone}`}><Icon size={14} className={status === 'started' ? 'animate-spin' : ''} /></span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-xs font-semibold text-[#344a40]">{event.stepName || event.stepId || event.type || 'Progress update'}</span><span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[.08em] ${tone}`}>{status}</span><span className="ml-auto flex items-center gap-1 font-mono text-[9px] text-[#9aa49b]"><Clock3 size={10} />{event.durationMs != null ? `${event.durationMs} ms` : timeLabel(event.createdAt)}</span></div>
            {event.detail && <p className="mt-1 break-words text-[11px] leading-5 text-[#78867d]">{event.detail}</p>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}

function RunControls({ runId, onRetry, retrying, liveEvents, onEvent }: { runId: string; onRetry: () => void; retrying: boolean; liveEvents: LiveEvent[]; onEvent: (event: LiveEvent) => void }) {
  const [speed, setSpeed] = useState('1');
  const [playing, setPlaying] = useState(false);
  const { data: run, isLoading, isError, refetch } = useGetRun(runId, { query: { queryKey: getGetRunQueryKey(runId), enabled: !!runId } });
  const events = useMemo(() => {
    const stored = (run?.events || []) as RunEvent[];
    const storedIds = new Set(stored.map(event => event.id));
    return [...stored, ...liveEvents.filter(event => !event.id || !storedIds.has(event.id))];
  }, [run?.events, liveEvents]);
  const [cursor, setCursor] = useState<number | null>(null);
  useEffect(() => { setCursor(events.length); setPlaying(false); }, [runId, events.length]);
  useEffect(() => {
    if (!playing) return;
    const current = cursor ?? 0;
    const next = current + 1;
    if (next >= events.length) { setPlaying(false); return; }
    const currentAt = Date.parse(String(events[current]?.createdAt || ''));
    const nextAt = Date.parse(String(events[next]?.createdAt || ''));
    const recordedGap = Number.isFinite(currentAt) && Number.isFinite(nextAt)
      ? Math.max(0, nextAt - currentAt)
      : Math.max(0, Number(events[next]?.durationMs || 0));
    const timer = window.setTimeout(() => setCursor(next), recordedGap / Number(speed));
    return () => window.clearTimeout(timer);
  }, [playing, cursor, speed, events]);
  const shownCount = cursor ?? events.length;
  if (isLoading) return <LoadingBlock label="Loading run events" />;
  if (isError || !run) return <div className="rounded-[22px] border border-[#ebd7d0] bg-[#fcf3ef] p-5 text-sm text-[#8a5b50]" role="alert"><p>We could not load this run record.</p><button type="button" onClick={() => refetch()} className="mt-3 font-semibold underline" data-testid="button-retry-run-load">Try again</button></div>;
  return <div className="space-y-4">
    {run.status === 'needs_date' && <DatePrompt run={run} onEvent={onEvent} />}
    {run.status === 'partial' && <div className="flex items-start gap-3 rounded-2xl border border-[#ead9b8] bg-[#fbf3df] p-4 text-sm text-[#806d4a]" data-testid="marker-fallback"><Sparkles size={17} className="mt-0.5 shrink-0" /><p><b>Using a careful fallback.</b> The plan was saved with the best available outline. You can retry the practice questions below.</p></div>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e1e3d9] bg-[#fbfaf4] px-4 py-3">
      <div className="flex items-center gap-2"><button type="button" onClick={() => { if (shownCount >= events.length) setCursor(0); setPlaying(value => !value); }} disabled={!events.length} className="focus-ring flex h-9 items-center gap-2 rounded-full bg-[#346b5d] px-4 text-xs font-semibold text-[#fffdf7] disabled:opacity-45" data-testid="button-replay-toggle">{playing ? <Pause size={14} /> : <Play size={14} />}{playing ? 'Pause' : 'Replay'}</button><button type="button" onClick={() => { setPlaying(false); setCursor(0); }} className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-[#dfe2d8] text-[#68796f] hover:bg-[#f0f1e9]" aria-label="Restart replay" data-testid="button-replay-reset"><RotateCcw size={14} /></button><span className="font-mono text-[10px] text-[#8c988e]" data-testid="text-replay-progress">{shownCount} / {events.length}</span></div>
      <label className="flex items-center gap-2 text-[11px] font-medium text-[#748278]">Replay speed<select value={speed} onChange={event => setSpeed(event.target.value)} className="focus-ring rounded-lg border border-[#dfe2d8] bg-[#fffdf7] px-2.5 py-2 text-xs text-[#354a40]" data-testid="select-replay-speed"><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
    </div>
    <EventsPanel events={events.slice(0, shownCount)} />
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e1e3d9] bg-[#f7f6ee] px-4 py-3">
      <div><div className="text-xs font-semibold text-[#465e52]">Practice questions need another pass?</div><div className="mt-1 text-[11px] text-[#87938a]">Retry generation using this saved plan.</div></div>
      <button type="button" onClick={onRetry} disabled={retrying || !run.planId} className="focus-ring flex items-center gap-2 rounded-full border border-[#cfd9cf] bg-[#fffdf7] px-4 py-2.5 text-xs font-semibold text-[#4b7060] hover:bg-[#eef3eb] disabled:opacity-50" data-testid="button-retry-questions">{retrying ? <LoaderCircle size={14} className="animate-spin" /> : <RotateCcw size={14} />}Retry questions</button>
    </div>
  </div>;
}

function DatePrompt({ run, onEvent }: { run: RunDetail; onEvent: (event: LiveEvent) => void }) {
  const [testDate, setTestDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const qc = useQueryClient();
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!testDate) { setError('Choose the test date to continue.'); return; }
    setBusy(true);
    try {
      await readEventStream(await streamApi(`/runs/${run.id}/continue`, { testDate }), onEvent);
      await Promise.all([qc.invalidateQueries({ queryKey: getGetRunQueryKey(run.id) }), qc.invalidateQueries({ queryKey: getListPlansQueryKey() }), qc.invalidateQueries({ queryKey: getListRunsQueryKey() })]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The date could not be saved.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="rounded-[22px] border border-[#e8d7c7] bg-[#fcf1e8] p-5" data-testid="form-missing-test-date">
    <div className="flex gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f4decf] text-[#af6a4e]"><CalendarDays size={17} /></span><div><div className="font-serif text-lg text-[#4b5143]">One small detail first</div><p className="mt-1 text-xs leading-5 text-[#806f5d]">There was no test date in the school note. Add it and we can spread the practice days out.</p></div></div>
    <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input required type="date" value={testDate} onChange={event => setTestDate(event.target.value)} className="focus-ring min-h-11 flex-1 rounded-xl border border-[#e1cdbd] bg-[#fffdf8] px-3 text-sm text-[#394d42]" aria-label="Test date" data-testid="input-test-date" /><button type="submit" disabled={busy} className="focus-ring flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#346b5d] px-5 text-sm font-semibold text-[#fffdf7] disabled:opacity-60" data-testid="button-continue-with-date">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <ArrowRight size={15} />}Continue plan</button></div>
    {error && <p className="mt-2 text-xs text-[#a14d46]" role="alert" data-testid="text-date-error">{error}</p>}
  </form>;
}

function Workspace() {
  const { data: plans, isLoading, isError, refetch } = useListPlans({ query: { queryKey: getListPlansQueryKey() } });
  const { data: runs, isError: runsError, refetch: refetchRuns } = useListRuns({ query: { queryKey: getListRunsQueryKey() } });
  const [sourceText, setSourceText] = useState('');
  const [error, setError] = useState('');
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [liveRunId, setLiveRunId] = useState('');
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);
  async function createPlan(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!sourceText.trim()) { setError('Paste the note or syllabus to get started.'); return; }
    setRunning(true); setEvents([]); setLiveRunId('');
    const controller = new AbortController(); abortRef.current = controller;
    try {
      const response = await streamApi('/runs', { sourceText }, controller.signal);
      const runId = await readEventStream(response, item => {
        setEvents(previous => [...previous, item]);
        if (item.runId) setLiveRunId(item.runId);
      });
      const resolved = runId || liveRunId;
      await Promise.all([qc.invalidateQueries({ queryKey: getListPlansQueryKey() }), qc.invalidateQueries({ queryKey: getListRunsQueryKey() }), ...(resolved ? [qc.invalidateQueries({ queryKey: getGetRunQueryKey(resolved) })] : [])]);
      if (resolved) setLocation(`/runs/${resolved}`);
      else setError('The stream finished, but did not include a run ID. Your pasted syllabus is still here—please retry.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Something interrupted the plan. Your pasted text is still here.');
    } finally { setRunning(false); abortRef.current = null; }
  }
  useEffect(() => () => abortRef.current?.abort(), []);
  const allPlans = (plans || []) as PlanSummary[];
  const savedRuns = ((runs || []) as RunSummary[]).filter(run => !run.planId);
  return <main className="min-h-[100dvh] bg-[#f5f2e8] text-[#263b35]">
    <Header compact />
    <div className="mx-auto max-w-[1280px] px-5 pb-16 pt-8 md:px-9 md:pt-12">
      <div className="mb-9 flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div><div className="mb-3 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[.17em] text-[#839086]"><span className="h-2 w-2 rounded-full bg-[#cf8569]" /> A little structure, a lot less overwhelm</div><h1 className="font-serif text-4xl tracking-[-.045em] md:text-[52px]">Let’s make a plan.</h1><p className="mt-2 text-sm text-[#78867d]">Start with the school note. We’ll take it from there.</p></div>
        <div className="flex items-center gap-2 rounded-full border border-[#dfe2d8] bg-[#fbfaf4] px-4 py-2.5 text-xs text-[#728077]"><span className="h-2 w-2 rounded-full bg-[#70a07f]" /> Your progress is saved as it happens</div>
      </div>
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1.03fr)_minmax(380px,.97fr)]">
        <section className="rounded-[25px] border border-[#e1e2d8] bg-[#fffdf7] p-5 shadow-[0_12px_34px_rgba(54,71,60,.05)] sm:p-7">
          <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.13em] text-[#718477]"><FileText size={14} /> School note</div><h2 className="mt-2 font-serif text-[25px] tracking-[-.03em]">Paste it just as it is.</h2></div><span className="rounded-full bg-[#f1f2e9] px-3 py-1.5 font-mono text-[9px] uppercase tracking-[.1em] text-[#829086]">Up to 20,000 characters</span></div>
          <p className="mt-2 text-xs leading-5 text-[#89948b]">A photo transcription, teacher message, or topic list all work. No need to tidy.</p>
          <form onSubmit={createPlan} className="mt-5">
            <textarea value={sourceText} onChange={event => setSourceText(event.target.value)} maxLength={20000} rows={9} disabled={running} placeholder={'For example:\nReading: beginning sounds, rhyming words, sight words\nMath: counting to 50, making groups of 10\nTest: Friday, May 24'} className="focus-ring min-h-[210px] w-full resize-y rounded-2xl border border-[#dfe2d8] bg-[#fbfaf4] p-4 text-[13px] leading-6 text-[#344a40] placeholder:text-[#a6ada3] disabled:opacity-70" data-testid="input-syllabus" />
            <div className="mt-2 flex justify-between text-[10px] text-[#9aa39b]"><span>We keep your original note with the run.</span><span className="font-mono">{sourceText.length.toLocaleString()} / 20,000</span></div>
            <button type="submit" disabled={running} className="focus-ring mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#346b5d] px-5 text-sm font-semibold text-[#fffdf7] shadow-[0_8px_20px_rgba(52,107,93,.16)] transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-70" data-testid="button-create-plan">{running ? <><LoaderCircle size={16} className="animate-spin" /> Making the plan, step by step</> : <><Sparkles size={16} /> Make a practice plan <ArrowRight size={15} /></>}</button>
          </form>
          {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-[#ead0ca] bg-[#fcf1ed] p-3 text-xs leading-5 text-[#935950]" data-testid="status-plan-error"><X size={14} className="mt-0.5 shrink-0" /><span>{error} Your original text is preserved above.</span></div>}
          {running && <div className="mt-5 space-y-3"><div className="flex items-center gap-2 text-xs font-semibold text-[#6e8376]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#c8795d]" /> Following the work in real time</div><EventsPanel events={events} loading={!events.length} /></div>}
        </section>
        <aside className="space-y-5">
          <ArchitectureMap activeStep={events.at(-1)?.stepId} />
          <section className="rounded-[22px] border border-[#e1e3d9] bg-[#fbfaf4] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3"><div><div className="font-mono text-[9px] font-medium uppercase tracking-[.16em] text-[#87948b]">Your saved work</div><h2 className="mt-1 font-serif text-xl">Recent plans</h2></div><span className="rounded-full bg-[#e9eee6] px-2.5 py-1 font-mono text-[10px] text-[#617b69]">{isLoading ? '···' : allPlans.length}</span></div>
            {isLoading ? <div className="mt-5 space-y-3">{[0, 1].map(i => <div key={i} className="h-[68px] animate-pulse rounded-xl bg-[#e9ebe3]" />)}</div> :
              isError ? <div className="mt-5 rounded-xl bg-[#faf0eb] p-4 text-xs text-[#8b5d52]" role="alert">Saved plans could not load. <button type="button" onClick={() => refetch()} className="font-bold underline" data-testid="button-retry-plans">Try again</button></div> :
              allPlans.length ? <div className="mt-4 divide-y divide-[#ebece3]">
                {allPlans.slice(0, 6).map(plan => <div key={plan.id} className="flex items-center gap-3 py-3" data-testid={`row-saved-plan-${plan.id}`}>
                  <Link href={`/plans/${plan.id}`} className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-lg" data-testid={`link-plan-${plan.id}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f1e4d6] text-[#ae7554]"><BookOpen size={15} /></span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-[#455a4f]">{plan.title}</span><span className="mt-1 block text-[10px] text-[#929c93]">Test {dateLabel(plan.testDate)} · {plan.completedCount}/{plan.totalCount} done</span></span></Link>
                  <Link href={`/runs/${plan.runId}`} className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#849187] hover:bg-[#ebeee6] hover:text-[#426c59]" aria-label={`Open run history for ${plan.title}`} data-testid={`link-run-${plan.runId}`}><Activity size={14} /></Link>
                </div>)}
              </div> : <div className="mt-5 rounded-2xl border border-dashed border-[#d9ded3] bg-[#f7f6ef] px-4 py-7 text-center"><span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#ebece2] text-[#869589]"><BookOpen size={18} /></span><p className="mt-3 font-serif text-base">Your first plan starts here.</p><p className="mt-1 text-xs text-[#909b91]">Paste the school note when you’re ready.</p></div>}
            {savedRuns.length > 0 && <div className="mt-4 border-t border-[#ebece3] pt-4">
              <div className="mb-2 flex items-center justify-between"><h3 className="font-mono text-[9px] font-medium uppercase tracking-[.15em] text-[#87948b]">Saved runs to finish</h3><span className="text-[10px] text-[#9aa39b]">{savedRuns.length}</span></div>
              <div className="divide-y divide-[#ebece3]">
                {savedRuns.slice(0, 5).map(run => <Link key={run.id} href={`/runs/${run.id}`} className="focus-ring flex items-center gap-3 py-3" data-testid={`link-saved-run-${run.id}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${run.status === 'failed' ? 'bg-[#c8795d]' : run.status === 'needs_date' ? 'bg-[#bd9b61]' : 'bg-[#70a07f]'}`} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-xs text-[#455a4f]">{run.sourceText.replace(/\s+/g, ' ').trim().slice(0, 78) || 'Untitled school note'}</span><span className="mt-1 block text-[10px] text-[#929c93]">{run.status === 'needs_date' ? 'Waiting for a test date' : run.status === 'failed' ? 'Could not finish · open run details' : 'Processing · open run details'}</span></span>
                  <ArrowRight size={14} className="shrink-0 text-[#849187]" />
                </Link>)}
              </div>
            </div>}
            {runsError && <div className="mt-3 rounded-xl bg-[#faf0eb] p-3 text-xs text-[#8b5d52]" role="alert">Saved drafts could not load. <button type="button" onClick={() => refetchRuns()} className="font-bold underline">Try again</button></div>}
          </section>
        </aside>
      </div>
    </div>
  </main>;
}

function PlanPage() {
  const { planId = '' } = useParams<{ planId: string }>();
  const { data: plan, isLoading, isError, refetch } = useGetPlan(planId, { query: { queryKey: getGetPlanQueryKey(planId), enabled: !!planId } });
  const updateItem = useUpdatePlanItem();
  const markChecklistShown = useMarkChecklistShown();
  const qc = useQueryClient();
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const acknowledgedRun = useRef<string | null>(null);
  useEffect(() => {
    if (!plan?.runId || acknowledgedRun.current === plan.runId) return;
    acknowledgedRun.current = plan.runId;
    markChecklistShown.mutate({ runId: plan.runId }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: getGetRunQueryKey(plan.runId) }),
      onError: () => { acknowledgedRun.current = null; },
    });
  }, [plan?.runId, markChecklistShown, qc]);
  if (isLoading) return <PageShell><LoadingBlock label="Loading your checklist" /></PageShell>;
  if (isError || !plan) return <PageShell><FailureCard title="This plan could not be opened." onRetry={() => refetch()} /></PageShell>;
  const typedPlan = plan as PlanDetail;
  const allItems = typedPlan.days.flatMap(day => day.items);
  const done = allItems.filter(item => item.checked).length;
  async function toggle(itemId: string, checked: boolean) {
    setSaveError('');
    const updated = await updateItem.mutateAsync({ planId, itemId, data: { checked } });
    qc.setQueryData(getGetPlanQueryKey(planId), (old: PlanDetail | undefined) => old ? { ...old, days: old.days.map(day => ({ ...day, items: day.items.map(item => item.id === itemId ? updated : item) })) } : old);
    qc.setQueryData(getListPlansQueryKey(), (old: PlanSummary[] | undefined) => old?.map(summary => summary.id === planId ? { ...summary, completedCount: summary.completedCount + (checked ? 1 : -1) } : summary));
  }
  return <PageShell>
    <Link href="/" className="focus-ring mb-6 inline-flex items-center gap-2 text-xs font-semibold text-[#76857b] hover:text-[#346b5d]" data-testid="link-back-workspace"><ArrowLeft size={14} /> Back to plans</Link>
    <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.15em] text-[#87948b]"><CalendarDays size={13} /> Test day · {dateLabel(typedPlan.testDate)}</div><h1 className="mt-3 font-serif text-4xl tracking-[-.04em] md:text-[48px]" data-testid="text-plan-title">{typedPlan.title}</h1><p className="mt-2 text-sm text-[#839087]">One manageable day at a time.</p></div><Link href={`/runs/${typedPlan.runId}`} className="focus-ring flex items-center gap-2 rounded-full border border-[#dfe2d8] bg-[#fffdf7] px-4 py-2.5 text-xs font-semibold text-[#5d7567] hover:bg-[#edf1e9]" data-testid="link-plan-run-record"><Activity size={14} /> View run record</Link></div>
        <div className="mt-7 rounded-[22px] border border-[#e1e3d9] bg-[#fbfaf4] p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#839187]">Practice progress</div><div className="mt-1 font-serif text-xl">{done} of {allItems.length} topics checked off</div></div><div className="font-mono text-lg text-[#55816a]">{allItems.length ? Math.round(done / allItems.length * 100) : 0}%</div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e8ebe2]"><div className="h-full rounded-full bg-[#6b967c] transition-[width]" style={{ width: `${allItems.length ? done / allItems.length * 100 : 0}%` }} /></div></div>
        {saveError && <p className="mt-3 rounded-lg bg-[#fcf1ed] p-3 text-xs text-[#935950]" role="alert" data-testid="status-checklist-error">{saveError}</p>}
        <div className="mt-7 space-y-4">
          {typedPlan.days.map((day, dayIndex) => <section key={day.id} className="overflow-hidden rounded-[22px] border border-[#e1e3d9] bg-[#fffdf7]" data-testid={`section-study-day-${day.id}`}>
            <div className="flex items-center gap-4 border-b border-[#eeeee6] bg-[#f7f6ef] px-4 py-4 sm:px-5"><span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-[#e9efe5] text-[#5f806b]"><span className="font-mono text-[8px] uppercase">Day</span><span className="text-sm font-bold leading-none">{String(dayIndex + 1).padStart(2, '0')}</span></span><div className="min-w-0 flex-1"><h2 className="font-serif text-lg">{dateLabel(day.date)}</h2><p className="mt-0.5 text-[10px] text-[#89958c]">{day.items.filter(item => item.checked).length} of {day.items.length} topics complete</p></div><span className="hidden rounded-full bg-[#fffdf7] px-3 py-1.5 font-mono text-[9px] text-[#86948a] sm:inline">{day.items.length} TOPICS</span></div>
            <div className="divide-y divide-[#efeee8]">
              {day.items.map(item => <div key={item.id} className={`px-4 py-4 transition-colors sm:px-5 ${item.checked ? 'bg-[#f8faf5]' : ''}`} data-testid={`row-checklist-item-${item.id}`}>
                <div className="flex items-start gap-3"><button type="button" onClick={() => toggle(item.id, !item.checked).catch(reason => setSaveError(reason instanceof Error ? reason.message : 'This update could not be saved.'))} disabled={updateItem.isPending} aria-label={`${item.checked ? 'Mark incomplete' : 'Mark complete'}: ${item.topic}`} className={`focus-ring mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-colors ${item.checked ? 'border-[#5c8c70] bg-[#5c8c70] text-white' : 'border-[#cfd7cb] bg-white text-transparent hover:border-[#6a9479]'}`} data-testid={`button-check-${item.id}`}>{item.checked && <Check size={15} />}</button>
                  <div className="min-w-0 flex-1"><div className="text-[10px] font-bold uppercase tracking-[.12em] text-[#a47c61]">{item.subject}</div><div className={`mt-1 text-sm font-semibold ${item.checked ? 'text-[#809087]' : 'text-[#344a40]'}`}>{item.topic}</div></div>
                  {item.questions.length > 0 && <button type="button" onClick={() => setOpenQuestion(openQuestion === item.id ? null : item.id)} className="focus-ring flex shrink-0 items-center gap-1 rounded-full border border-[#e1e4da] px-2.5 py-1.5 text-[10px] font-semibold text-[#728477] hover:bg-[#f1f3ea]" data-testid={`button-questions-${item.id}`}><BookOpen size={12} /> {item.questions.length}<ChevronDown size={12} className={openQuestion === item.id ? 'rotate-180' : ''} /></button>}
                </div>
                {openQuestion === item.id && item.questions.length > 0 && <div className="ml-9 mt-4 space-y-2 border-l-2 border-[#dce7d9] pl-3">{item.questions.map((question, index) => <details key={`${question.question}-${index}`} className="rounded-xl border border-[#e9ebe3] bg-[#fbfaf4] p-3"><summary className="focus-ring cursor-pointer list-none text-xs font-medium leading-5 text-[#4c6055]">{question.question}<span className="float-right text-[#9aa59b]">Answer</span></summary><p className="mt-3 border-t border-[#e7e9df] pt-3 text-xs leading-5 text-[#76857b]">{question.answer}</p></details>)}</div>}
              </div>)}
              {!day.items.length && <p className="p-5 text-sm text-[#8a968d]">No topics were assigned to this day.</p>}
            </div>
          </section>)}
        </div>
      </section>
      <aside className="space-y-4 lg:sticky lg:top-6">
        <div className="rounded-[22px] border border-[#e1e3d9] bg-[#e9eee5] p-5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fffdf7] text-[#63816b]"><CheckCircle2 size={17} /></span><h2 className="mt-3 font-serif text-xl">Small is enough.</h2><p className="mt-2 text-xs leading-5 text-[#748178]">A checked box is a real bit of progress. Stop for today whenever your child is ready.</p></div>
        <div className="rounded-[22px] border border-[#e1e3d9] bg-[#fbfaf4] p-5"><div className="font-mono text-[9px] uppercase tracking-[.15em] text-[#89968c]">Original school note</div><p className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-6 text-[#78867d]">{typedPlan.sourceText}</p></div>
      </aside>
    </div>
  </PageShell>;
}

function PageShell({ children }: { children: ReactNode }) {
  return <main className="min-h-[100dvh] bg-[#f5f2e8] text-[#263b35]"><Header compact /><div className="mx-auto max-w-[1200px] px-5 pb-16 pt-7 md:px-9 md:pt-10">{children}</div></main>;
}
function FailureCard({ title, onRetry }: { title: string; onRetry: () => void }) {
  return <div className="rounded-[22px] border border-[#ead7d0] bg-[#fbf1ed] p-6" role="alert"><h1 className="font-serif text-2xl text-[#694c44]">{title}</h1><p className="mt-2 text-sm text-[#89665a]">The saved record may be temporarily unavailable.</p><button type="button" onClick={onRetry} className="focus-ring mt-4 rounded-full bg-[#346b5d] px-4 py-2.5 text-xs font-semibold text-white" data-testid="button-retry-load">Try again</button></div>;
}

function RunPage() {
  const { runId = '' } = useParams<{ runId: string }>();
  const { data: run, isLoading, isError, refetch } = useGetRun(runId, { query: { queryKey: getGetRunQueryKey(runId), enabled: !!runId } });
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const qc = useQueryClient();
  async function retryQuestions() {
    setRetryError(''); setRetrying(true);
    try {
      await readEventStream(await streamApi(`/runs/${runId}/retry-questions`), item => setLiveEvents(previous => [...previous, item]));
      await Promise.all([qc.invalidateQueries({ queryKey: getGetRunQueryKey(runId) }), qc.invalidateQueries({ queryKey: getListPlansQueryKey() })]);
      setLiveEvents([]);
    } catch (error) { setRetryError(error instanceof Error ? error.message : 'The retry could not finish.'); }
    finally { setRetrying(false); }
  }
  if (isLoading) return <PageShell><LoadingBlock label="Loading the run history" /></PageShell>;
  if (isError || !run) return <PageShell><FailureCard title="This run record could not be opened." onRetry={() => refetch()} /></PageShell>;
  const planLink = run.planId ? `/plans/${run.planId}` : null;
  return <PageShell>
    <Link href="/" className="focus-ring mb-6 inline-flex items-center gap-2 text-xs font-semibold text-[#76857b] hover:text-[#346b5d]" data-testid="link-back-workspace"><ArrowLeft size={14} /> Back to plans</Link>
    <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[.15em] text-[#87948b]"><Activity size={13} /> Plan activity · {timeLabel(run.createdAt)}</div><h1 className="mt-3 font-serif text-4xl tracking-[-.04em] md:text-[48px]">The work, in the open.</h1><p className="mt-2 text-sm text-[#839087]">A stored record of how this practice plan came together.</p></div><div className="flex flex-wrap items-center gap-2"><StatusChip status={run.status} />{planLink && <Link href={planLink} className="focus-ring inline-flex items-center gap-2 rounded-full bg-[#346b5d] px-4 py-2.5 text-xs font-semibold text-[#fffdf7]" data-testid="link-open-plan"><BookOpen size={14} /> Open checklist <ExternalLink size={12} /></Link>}</div></div>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(330px,.82fr)]">
      <section className="space-y-5"><RunControls runId={runId} onRetry={retryQuestions} retrying={retrying} liveEvents={liveEvents} onEvent={item => setLiveEvents(previous => [...previous, item])} />{retryError && <div className="rounded-xl bg-[#fcf1ed] p-3 text-xs text-[#935950]" role="alert" data-testid="status-retry-error">{retryError}</div>}
        <details className="rounded-[22px] border border-[#e1e3d9] bg-[#fbfaf4] p-4"><summary className="focus-ring flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-[#617369]" data-testid="summary-source-text">See the original school note <ChevronDown size={14} /></summary><pre className="mt-4 max-h-[300px] overflow-auto whitespace-pre-wrap border-t border-[#e8e8df] pt-4 font-sans text-xs leading-6 text-[#7d8a80]">{run.sourceText}</pre></details>
      </section>
      <aside><ArchitectureMap activeStep={run.events.at(-1)?.stepId} /><div className="mt-4 rounded-[22px] border border-[#e1e3d9] bg-[#e9eee5] p-5"><div className="flex items-center gap-2 text-xs font-semibold text-[#557361]"><CheckCircle2 size={15} /> The record stays with the plan</div><p className="mt-2 text-xs leading-5 text-[#76847a]">Each start, finish, skipped step, or retry is kept here so you can see what happened—not just the final checklist.</p></div></aside>
    </div>
  </PageShell>;
}

function HomeRoute() {
  return <><Show when="signed-in"><Workspace /></Show><Show when="signed-out"><LandingPage /></Show></>;
}
function Protected({ children }: { children: ReactNode }) {
  return <><Show when="signed-in">{children}</Show><Show when="signed-out"><Redirect to="/sign-in" /></Show></>;
}
function SignInPage() {
  return <main className="paper-grain flex min-h-[100dvh] items-center justify-center bg-[#f5f2e8] px-4 py-10"><div className="w-full"><p className="mb-5 text-center font-serif text-2xl text-[#346b5d]">A little bit more ready.</p><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></div></main>;
}
function SignUpPage() {
  return <main className="paper-grain flex min-h-[100dvh] items-center justify-center bg-[#f5f2e8] px-4 py-10"><div className="w-full"><p className="mb-5 text-center font-serif text-2xl text-[#346b5d]">Make room for small steps.</p><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></div></main>;
}
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const client = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (previous.current !== undefined && previous.current !== userId) client.clear();
    previous.current = userId;
  }), [addListener, client]);
  return null;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function RouterRoutes() {
  return <RoutedErrorBoundary><Switch>
    <Route path="/" component={HomeRoute} />
    <Route path="/sign-in/*?" component={SignInPage} />
    <Route path="/sign-up/*?" component={SignUpPage} />
    <Route path="/plans/:planId">{() => <Protected><PlanPage /></Protected>}</Route>
    <Route path="/runs/:runId">{() => <Protected><RunPage /></Protected>}</Route>
    <Route component={NotFound} />
  </Switch></RoutedErrorBoundary>;
}
function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`}
    localization={{ signIn: { start: { title: 'Welcome back', subtitle: 'Pick up where you left off' } }, signUp: { start: { title: 'Make your family space', subtitle: 'A calmer plan starts here' } } }}
    routerPush={to => setLocation(stripBase(to))} routerReplace={to => setLocation(stripBase(to), { replace: true })}>
    <QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator /><RouterRoutes /></QueryClientProvider>
  </ClerkProvider>;
}
function App() {
  return <TooltipProvider><WouterRouter base={basePath}><ClerkProviderWithRoutes /></WouterRouter><Toaster /></TooltipProvider>;
}

export default App;
