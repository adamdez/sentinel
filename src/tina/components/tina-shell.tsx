import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function TinaShell({
  children,
  eyebrow,
  title,
  description,
  activeView = "workspace",
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
  activeView?: "workspace" | "packets";
}) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(134,239,172,0.12),transparent_28%),radial-gradient(circle_at_right,rgba(234,179,8,0.10),transparent_24%),linear-gradient(180deg,#111827_0%,#09090b_100%)] text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1280px] flex-col px-5 py-5 lg:px-7">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[28px] border border-white/10 bg-black/20 px-4 py-3 backdrop-blur-2xl">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" className="text-zinc-300 hover:bg-white/8 hover:text-white">
              <Link href="/dashboard">
                <ArrowLeft className="h-4 w-4" />
                Leave Tina
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
          <div className="flex flex-wrap items-center gap-2">
            <Button
              asChild
              variant="outline"
              className={cn(
                "border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8",
                activeView === "workspace" &&
                  "border-emerald-300/18 bg-emerald-300/8 text-emerald-50"
              )}
            >
              <Link href="/tina">Workspace</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className={cn(
                "border-white/10 bg-white/5 text-zinc-100 hover:bg-white/8",
                activeView === "packets" &&
                  "border-emerald-300/18 bg-emerald-300/8 text-emerald-50"
              )}
            >
              <Link href="/tina/packets">Saved packets</Link>
            </Button>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 uppercase tracking-[0.18em] text-emerald-100">
              Private business-tax workspace
            </span>
          </div>
        </header>

        <main className="flex-1 space-y-5">
          <section className="rounded-[32px] border border-white/10 bg-black/20 px-6 py-7 shadow-[0_24px_80px_rgba(0,0,0,0.32)] backdrop-blur-2xl">
            <div className="space-y-4">
              <div className="space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">{eyebrow}</p>
                <h2 className="max-w-4xl text-4xl font-semibold tracking-tight text-white">{title}</h2>
                <p className="max-w-3xl text-base leading-7 text-zinc-300">{description}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/80">
                    One step at a time
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-200">
                    Tina should only put a few clear asks in front of you at once.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/80">
                    Plain words first
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-200">
                    Start with the papers and basics. Tina can unpack tax language later.
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-100/80">
                    Deeper review stays tucked away
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-200">
                    Most owners should not need the deeper CPA-style tools until later.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {children}
        </main>
      </div>
    </div>
  );
}
