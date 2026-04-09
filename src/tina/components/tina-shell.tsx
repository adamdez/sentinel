import Link from "next/link";
import { ArrowLeft, FileText, FolderKanban, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function TinaShell({
  children,
  eyebrow,
  title,
  description,
  secondaryLink,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  secondaryLink?: {
    href: string;
    label: string;
  };
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(134,239,172,0.12),transparent_28%),radial-gradient(circle_at_right,rgba(234,179,8,0.10),transparent_24%),linear-gradient(180deg,#111827_0%,#09090b_100%)] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 py-5 lg:px-7">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" className="text-zinc-300 hover:bg-white/8 hover:text-white">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Back to Sentinel
              </Link>
            </Button>
            <div className="hidden h-8 w-px bg-white/10 sm:block" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
                {eyebrow}
              </p>
              <h1 className="text-lg font-semibold tracking-tight text-white">Tina</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            {secondaryLink ? (
              <Button
                asChild
                variant="ghost"
                className="border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10 hover:text-white"
              >
                <Link href={secondaryLink.href}>{secondaryLink.label}</Link>
              </Button>
            ) : null}
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 uppercase tracking-[0.18em] text-emerald-100">
              Private Tax Workspace
            </span>
          </div>
        </header>

        <div className="grid flex-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
              <CardContent className="space-y-4 p-5">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-100">
                  <Sparkles className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
                    Tina Mode
                  </p>
                  <p className="text-sm leading-6 text-zinc-200">
                    Tina is your simple tax helper space inside Sentinel. One step at a time, plain words first.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <FolderKanban className="h-4 w-4 text-emerald-200" />
                  How Tina works
                </div>
                <ul className="space-y-2 text-sm leading-6 text-zinc-300">
                  <li>Tina asks for one clear thing at a time.</li>
                  <li>Tina explains why she needs each paper.</li>
                  <li>Tina keeps the math in code so the numbers stay steady.</li>
                </ul>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white/5 backdrop-blur-2xl shadow-[0_16px_60px_rgba(0,0,0,0.3)]">
              <CardContent className="space-y-3 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  <FileText className="h-4 w-4 text-emerald-200" />
                  Persistent guide
                </div>
                <p className="text-sm leading-6 text-zinc-300">
                  Tina's long-term build guide is saved in <span className="font-mono text-zinc-100">docs/tina/TINA_V1_BUILD_GUIDE.md</span>.
                </p>
              </CardContent>
            </Card>
          </aside>

          <main className="space-y-5">
            <section className="rounded-[32px] border border-white/10 bg-black/20 px-6 py-7 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">{eyebrow}</p>
              <h2 className="mt-3 text-4xl font-semibold tracking-tight text-white">{title}</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-zinc-300">{description}</p>
            </section>

            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
