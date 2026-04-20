import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

type SubmittedRequest = {
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  domaine: string;
  typeOrganisation: string;
  pays: string;
  siteWeb: string;
  description: string;
  leadSource: string;
  sourceReferrer: string;
  landingUrl: string;
};

const SOURCE_HOST_ALIASES: Array<{ match: RegExp; label: string }> = [
  { match: /(^|\.)l\.facebook\.com$/i, label: "facebook" },
  { match: /(^|\.)m\.facebook\.com$/i, label: "facebook" },
  { match: /(^|\.)facebook\.com$/i, label: "facebook" },
  { match: /(^|\.)instagram\.com$/i, label: "instagram" },
  { match: /(^|\.)linkedin\.com$/i, label: "linkedin" },
  { match: /(^|\.)tiktok\.com$/i, label: "tiktok" },
  { match: /(^|\.)google\./i, label: "google" },
];

const toSourceFromHost = (hostOrUrl: string): string | null => {
  const raw = String(hostOrUrl ?? "").trim();
  if (!raw) return null;

  const host = (() => {
    try {
      return new URL(raw).hostname;
    } catch {
      return raw;
    }
  })().replace(/^www\./i, "").toLowerCase();

  for (const entry of SOURCE_HOST_ALIASES) {
    if (entry.match.test(host)) return entry.label;
  }
  return host || null;
};

const resolveSource = (): string => {
  const params = new URLSearchParams(window.location.search);
  const explicit = params.get("source") ?? params.get("utm_source") ?? params.get("ref");
  if (explicit && explicit.trim()) {
    return explicit.trim().toLowerCase();
  }

  if (params.get("fbclid")) return "facebook";
  if (params.get("ttclid")) return "tiktok";
  if (params.get("gclid")) return "google";

  const fromReferrer = toSourceFromHost(document.referrer);
  if (fromReferrer) return fromReferrer;

  const fromStorage = toSourceFromHost(localStorage.getItem("utm_source") ?? "");
  return fromStorage ?? "direct";
};

const Formulaire = () => {
  const [form, setForm] = useState({
  prenom: "",
  nom: "",
  email: "",
  telephone: "",
  domaine: "",
  type: "",
  pays: "",
  siteWeb: "",
  description: "",
  leadSource: "",
});
  const [submittedRequest, setSubmittedRequest] = useState<SubmittedRequest | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sourceLabel = useMemo(() => form.leadSource || "direct", [form.leadSource]);

  useEffect(() => {
    const source = resolveSource();
    localStorage.setItem("utm_source", source);

    setForm((prev) => ({
      ...prev,
      leadSource: source,
    }));
  }, []);
  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) {
      return;
    }

    if (
      !form.prenom ||
      !form.nom ||
      !form.email ||
      !form.telephone ||
      !form.domaine ||
      !form.type ||
      !form.description
    ) {
      toast.error("Veuillez remplir tous les champs obligatoires.");
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        prenom: form.prenom,
        nom: form.nom,
        email: form.email,
        telephone: form.telephone,
        domaine: form.domaine,
        typeOrganisation: form.type,
        pays: form.pays,
        siteWeb: form.siteWeb,
        description: form.description,
        leadSource: form.leadSource,
        sourceReferrer: document.referrer || null,
        landingUrl: window.location.href,
        role: "Guest",
      };

      const response = await fetch("http://localhost:5000/api/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const savePayload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(savePayload?.error ?? "Erreur serveur");
      }

      setSubmittedRequest(payload);
      setSuccessOpen(true);
      toast.success("Formulaire envoyé avec succès !");
      setForm((prev) => ({
        ...prev,
        prenom: "",
        nom: "",
        email: "",
        telephone: "",
        domaine: "",
        type: "",
        pays: "",
        siteWeb: "",
        description: "",
      }));
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Erreur lors de l'envoi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="flex items-center gap-4 px-8 py-6 border-b border-border">
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Retour
          </Button>
        </Link>
        <span className="text-xl font-bold tracking-tight">MonEntreprise</span>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Formulaire de contact</h1>
        <p className="text-muted-foreground mb-10">Remplissez les informations ci-dessous. Les champs marqués * sont obligatoires.</p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prenom">Prénom *</Label>
              <Input id="prenom" placeholder="Votre prénom" value={form.prenom} onChange={(e) => handleChange("prenom", e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nom">Nom *</Label>
              <Input id="nom" placeholder="Votre nom" value={form.nom} onChange={(e) => handleChange("nom", e.target.value)} maxLength={100} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input id="email" type="email" placeholder="exemple@email.com" value={form.email} onChange={(e) => handleChange("email", e.target.value)} maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telephone">Téléphone *</Label>
              <Input id="telephone" type="tel" placeholder="+212 6XX XXX XXX" value={form.telephone} onChange={(e) => handleChange("telephone", e.target.value)} maxLength={20} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="domaine">Domaine d'activité *</Label>
            <Input id="domaine" placeholder="Ex: Technologie, Santé, Éducation..." value={form.domaine} onChange={(e) => handleChange("domaine", e.target.value)} maxLength={150} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Type d'organisation *</Label>
              <Select value={form.type} onValueChange={(v) => handleChange("type", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entreprise">Entreprise</SelectItem>
                  <SelectItem value="institution">Institution</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pays">Pays</Label>
              <Input id="pays" placeholder="Votre pays" value={form.pays} onChange={(e) => handleChange("pays", e.target.value)} maxLength={100} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="siteWeb">Site web</Label>
            <Input id="siteWeb" type="url" placeholder="https://www.example.com" value={form.siteWeb} onChange={(e) => handleChange("siteWeb", e.target.value)} maxLength={255} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description du besoin *</Label>
            <Textarea id="description" placeholder="Décrivez votre projet ou besoin..." rows={5} value={form.description} onChange={(e) => handleChange("description", e.target.value)} maxLength={1000} />
          </div>

          <Button type="submit" size="lg" className="w-full text-base py-6" disabled={isSubmitting}>
            {isSubmitting ? "Envoi..." : "Envoyer le formulaire"}
          </Button>
        </form>
      </div>

      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Formulaire envoyé</DialogTitle>
            <DialogDescription>
              La demande a été enregistrée dans la table lead_requests. Elle sera ajoutée à users après validation admin (Accept).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="font-semibold">Source du clic</p>
              <p className="text-muted-foreground">{sourceLabel}</p>
            </div>

            {submittedRequest && (
              <div className="grid gap-3 rounded-lg border border-border bg-background p-4 sm:grid-cols-2">
                <div><span className="font-semibold">Nom:</span> {submittedRequest.prenom} {submittedRequest.nom}</div>
                <div><span className="font-semibold">Email:</span> {submittedRequest.email}</div>
                <div><span className="font-semibold">Téléphone:</span> {submittedRequest.telephone}</div>
                <div><span className="font-semibold">Pays:</span> {submittedRequest.pays || "-"}</div>
                <div><span className="font-semibold">Domaine:</span> {submittedRequest.domaine}</div>
                <div><span className="font-semibold">Type:</span> {submittedRequest.typeOrganisation}</div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default Formulaire;
