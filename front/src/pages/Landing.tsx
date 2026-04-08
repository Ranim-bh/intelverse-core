import { useEffect, useMemo } from "react";
import { ArrowRight, ShieldCheck, Sparkles, Workflow } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

const fallbackSource = "unknown";

const getSourceLabel = (value: string | null): string => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallbackSource;
  return normalized;
};

export default function Landing() {
  const [searchParams] = useSearchParams();

  const source = useMemo(() => {
    return getSourceLabel(
      searchParams.get("source") ?? searchParams.get("utm_source") ?? searchParams.get("ref")
    );
  }, [searchParams]);

  useEffect(() => {
    localStorage.setItem("leadSource", source);
  }, [source]);

  const formUrl = `/form?source=${encodeURIComponent(source)}`;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(6,182,212,0.14),_transparent_28%),linear-gradient(180deg,_#f8fbfc_0%,_#eef6f8_100%)] text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl items-center px-6 py-10 lg:px-10">
        <div className="grid w-full gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <section className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Public lead journey · source: {source}
            </div>

            <div className="space-y-5">
              <h1 className="max-w-3xl text-5xl font-black tracking-tight text-balance sm:text-6xl lg:text-7xl">
                Capture the click source before the form starts.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
                The visitor lands here from your campaign link, and the source is preserved through
                the next step so the submission keeps its attribution when it reaches the backend.
              </p>
            </div>

            <div className="flex flex-wrap gap-4">
              <Link
                to={formUrl}
                className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5"
              >
                Open the form
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={formUrl}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-white/80 px-6 py-3 text-sm font-semibold text-foreground backdrop-blur transition-colors hover:bg-white"
              >
                Keep tracking the source
              </a>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {[
                {
                  icon: Workflow,
                  title: "Two-step flow",
                  text: "Landing page first, form second.",
                },
                {
                  icon: ShieldCheck,
                  title: "Source preserved",
                  text: "Query string and referrer are both captured.",
                },
                {
                  icon: Sparkles,
                  title: "Ngrok ready",
                  text: "Works with tunneled public URLs during local testing.",
                },
              ].map((item) => (
                <div key={item.title} className="rounded-2xl border border-border/70 bg-white/80 p-4 shadow-sm backdrop-blur">
                  <item.icon className="mb-3 h-5 w-5 text-primary" />
                  <h2 className="text-sm font-semibold text-foreground">{item.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.text}</p>
                </div>
              ))}
            </div>
          </section>

          <aside className="relative overflow-hidden rounded-[2rem] border border-white/60 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/15">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(6,182,212,0.32),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.18),_transparent_32%)]" />
            <div className="relative space-y-6">
              <div className="inline-flex rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.24em] text-white/70">
                Attribution preview
              </div>

              <div className="space-y-4 rounded-[1.5rem] border border-white/10 bg-white/5 p-5 backdrop-blur">
                <p className="text-sm text-white/60">Incoming source</p>
                <p className="text-2xl font-bold tracking-tight">{source}</p>
                <div className="grid gap-3 text-sm text-white/75 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-white/50">Step 1</p>
                    <p className="mt-1 font-medium">Landing page visit</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-white/50">Step 2</p>
                    <p className="mt-1 font-medium">Form submission</p>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-5 text-sm leading-6 text-white/75 backdrop-blur">
                If you open this page through an ngrok public URL, the form will send the preserved
                source to the backend together with the visitor data.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}