import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Mail, MapPin, Phone, Send } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

const readStoredSource = () => {
  if (typeof window === "undefined") {
    return "unknown";
  }

  const url = new URL(window.location.href);
  const storedSource = localStorage.getItem("leadSource") ?? "";
  const querySource = url.searchParams.get("source") ?? url.searchParams.get("utm_source") ?? "";
  const referrerSource = document.referrer.trim();
  return querySource || storedSource || referrerSource || window.location.hostname || "unknown";
};

export default function LeadForm() {
  const [searchParams] = useSearchParams();
  const source = useMemo(() => {
    return (
      searchParams.get("source") ??
      searchParams.get("utm_source") ??
      localStorage.getItem("leadSource") ??
      "unknown"
    );
  }, [searchParams]);

  const [formState, setFormState] = useState({
    prenom: "",
    nom: "",
    email: "",
    telephone: "",
    domaine: "",
    typeOrganisation: "",
    pays: "",
    description: "",
  });
  const [leadSource, setLeadSource] = useState(source);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const resolvedSource = source || readStoredSource();
    setLeadSource(resolvedSource);
    localStorage.setItem("leadSource", resolvedSource);
  }, [source]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formState,
          leadSource,
          sourceReferrer: document.referrer || null,
          landingUrl: window.location.href,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `Request failed with status ${response.status}`);
      }

      setStatus("success");
      setFormState({
        prenom: "",
        nom: "",
        email: "",
        telephone: "",
        domaine: "",
        typeOrganisation: "",
        pays: "",
        description: "",
      });
      setMessage("Votre demande a bien été envoyée et la source a été enregistrée.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Unable to submit the request.");
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_28%),linear-gradient(180deg,_#f7faf8_0%,_#eef3f1_100%)] px-4 py-10 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-start">
        <section className="space-y-6 rounded-[2rem] border border-border/70 bg-white/85 p-8 shadow-2xl shadow-slate-950/5 backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-success/20 bg-success/10 px-4 py-2 text-xs font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Source tracked: {leadSource}
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl font-black tracking-tight text-balance">Request form</h1>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              The source from the landing click stays attached to this submission so the backend can
              store campaign attribution together with the lead.
            </p>
          </div>

          <div className="grid gap-3">
            {[
              {
                icon: Mail,
                label: "Email",
                value: "Stored with the request",
              },
              {
                icon: Phone,
                label: "Telephone",
                value: "Optional but recommended",
              },
              {
                icon: MapPin,
                label: "Source",
                value: leadSource,
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 rounded-2xl border border-border/70 bg-slate-50 px-4 py-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <item.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.value}</p>
                </div>
              </div>
            ))}
          </div>

          <Link
            to={`/landing?source=${encodeURIComponent(leadSource)}`}
            className="inline-flex rounded-full border border-border bg-white px-5 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Back to landing page
          </Link>
        </section>

        <section className="rounded-[2rem] border border-border/70 bg-slate-950 p-6 text-white shadow-2xl shadow-slate-950/10 sm:p-8">
          <div className="mb-6 space-y-2">
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Submit your details</p>
            <h2 className="text-2xl font-bold">Tell us who you are</h2>
          </div>

          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-white/80">
                Prénom
                <input
                  required
                  value={formState.prenom}
                  onChange={(event) => setFormState((prev) => ({ ...prev, prenom: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary"
                  placeholder="Amina"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-white/80">
                Nom
                <input
                  required
                  value={formState.nom}
                  onChange={(event) => setFormState((prev) => ({ ...prev, nom: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary"
                  placeholder="Benali"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-white/80">
                Email
                <input
                  type="email"
                  required
                  value={formState.email}
                  onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary"
                  placeholder="amina@company.com"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-white/80">
                Téléphone
                <input
                  value={formState.telephone}
                  onChange={(event) => setFormState((prev) => ({ ...prev, telephone: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary"
                  placeholder="+33 6 00 00 00 00"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-white/80">
                Domaine
                <input
                  value={formState.domaine}
                  onChange={(event) => setFormState((prev) => ({ ...prev, domaine: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary"
                  placeholder="Technology"
                />
              </label>
              <label className="grid gap-2 text-sm font-medium text-white/80">
                Type d'organisation
                <input
                  value={formState.typeOrganisation}
                  onChange={(event) => setFormState((prev) => ({ ...prev, typeOrganisation: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary"
                  placeholder="Entreprise"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-white/80">
                Pays
                <input
                  value={formState.pays}
                  onChange={(event) => setFormState((prev) => ({ ...prev, pays: event.target.value }))}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary"
                  placeholder="France"
                />
              </label>
              <div className="grid gap-2 text-sm font-medium text-white/80">
                Lead source
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white/90">
                  {leadSource}
                </div>
              </div>
            </div>

            <label className="grid gap-2 text-sm font-medium text-white/80">
              Description
              <textarea
                rows={5}
                value={formState.description}
                onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition-colors placeholder:text-white/30 focus:border-primary"
                placeholder="Share a few details about your need."
              />
            </label>

            {message && (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  status === "success"
                    ? "border-success/30 bg-success/10 text-success"
                    : "border-destructive/30 bg-destructive/10 text-destructive"
                }`}
              >
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "submitting"}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {status === "submitting" ? "Submitting..." : "Send request"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}