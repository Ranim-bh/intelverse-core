import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppData } from "@/lib/db-client";
import { analyzeGuest } from "@/lib/scoring";
import {
  ArrowLeft,
  Calendar,
  Briefcase,
  Building2,
  Clock,
  Activity,
  Mic,
  Globe,
  TrendingUp,
  MessageSquare,
  ChevronRight,
  Zap,
  RefreshCw,
  FileDown,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { motion } from "motion/react";
import type { Guest } from "@/lib/types";
import { getOfferStatusBadgeClasses, getOfferStatusLabel } from "@/lib/offer-status";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

const StatCard = ({ icon: Icon, label, value, subValue, color }: {
  icon: React.ElementType; label: string; value: string | number; subValue?: string; color: string;
}) => (
  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
    <div className="flex items-center gap-3 mb-3">
      <div className={cn("p-2 rounded-lg", color)}>
        <Icon size={20} />
      </div>
      <span className="text-sm font-medium text-slate-500">{label}</span>
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-bold text-slate-900">{value}</span>
      {subValue && <span className="text-xs text-slate-500 font-medium">{subValue}</span>}
    </div>
  </div>
);

type RecommendationResponse = {
  guest_id: string;
  engagement_score: number;
  tier: string;
  score_breakdown?: {
    guest_score: number;
    room_score: number;
    top_room: string;
    top_room_by_interactions: string;
  };
  recommended_pack: {
    pack_id?: string;
    pack_code: string;
    pack_name: string;
    nb_rooms: number;
    services: string[];
    reason: string;
  };
};

// Derive extra data from our Guest type
function deriveGuestData(guest: Guest) {
  const analysis = analyzeGuest(guest);
  const navigationBasedVisits = guest.navigation_path.reduce<Record<string, number>>((acc, step) => {
    if (step === "Showcase Room" || step === "Opportunity Room" || step === "Pitch Room" || step === "Training Center") {
      acc[step] = (acc[step] || 0) + 1;
    }
    return acc;
  }, {});

  const hasNavigationRoomVisits = Object.keys(navigationBasedVisits).length > 0;
  const showcaseVisits = hasNavigationRoomVisits
    ? navigationBasedVisits["Showcase Room"] || 0
    : guest.room_observation_time["Showcase Room"] || 0;
  const opportunityVisits = hasNavigationRoomVisits
    ? navigationBasedVisits["Opportunity Room"] || 0
    : guest.room_observation_time["Opportunity Room"] || 0;
  const pitchVisits = hasNavigationRoomVisits
    ? navigationBasedVisits["Pitch Room"] || 0
    : guest.room_observation_time["Pitch Room"] || 0;
  const trainingVisits = hasNavigationRoomVisits
    ? navigationBasedVisits["Training Center"] || 0
    : guest.room_observation_time["Training Center"] || 0;

  const activityHistory = Object.entries(guest.room_click_rate).map(([room, interactions]) => ({
    date: room,
    interactions,
  }));

  const aiInsights: string[] = [];
  if (guest.voice_interaction_time > 2) aiInsights.push(`Forte utilisation vocale (${guest.voice_interaction_time} min) — profil orienté networking.`);
  if (guest.rooms_viewed.length >= 3) aiInsights.push(`A exploré ${guest.rooms_viewed.length} rooms — intérêt multi-services confirmé.`);
  if (guest.idle_time > 1) aiInsights.push(`Temps d'inactivité de ${guest.idle_time} min détecté — risque de désengagement.`);
  if (analysis.score > 70) aiInsights.push("Score élevé — candidat prioritaire pour conversion rapide.");
  if (guest.customization_time > 1) aiInsights.push(`Temps de personnalisation de ${guest.customization_time} min — fort intérêt produit.`);

  return {
    analysis,
    showcaseVisits,
    opportunityVisits,
    pitchVisits,
    trainingVisits,
    activityHistory,
    aiInsights,
    conversionProbability: Math.min(99, analysis.score + 5),
  };
}

const canRegenerate = (status: string) =>
  status === "pending" ||
  status === "approved" ||
  status === "rejected" ||
  status === "READY" ||
  status === "DRAFT" ||
  status === "PENDING";

export default function GuestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [adminNote, setAdminNote] = useState("");
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [savingPack, setSavingPack] = useState(false);
  const [savedPack, setSavedPack] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { data, loading, error } = useAppData();

  const guests = data.guests;
  const guest = guests.find((g) => g.id === id);

  const loadRecommendation = async (guestId: string) => {
    setRecommendationLoading(true);
    setRecommendationError(null);
    try {
      const res = await fetch(`/api/recommend/${encodeURIComponent(guestId)}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = typeof body?.error === "string" ? body.error : `Recommendation API error ${res.status}`;
        throw new Error(message);
      }

      const payload = (body && typeof body === "object" && body.fallback)
        ? body.fallback as RecommendationResponse
        : body as RecommendationResponse;
      setRecommendation(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load recommendation";
      setRecommendationError(message);
      setRecommendation(null);
    } finally {
      setRecommendationLoading(false);
    }
  };

  const saveCurrentPack = async () => {
    if (!id || !recommendation) return;
    setSavingPack(true);
    setSaveError(null);

    try {
      const res = await fetch(`/api/recommend/${encodeURIComponent(id)}/save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recommendation),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || `Save API error ${res.status}`);
      }

      setSavedPack(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save pack");
    } finally {
      setSavingPack(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    void loadRecommendation(id);
  }, [id]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Chargement des donnees...</div>;
  }

  if (error) {
    return <div className="text-sm text-destructive">Erreur donnees: {error}</div>;
  }

  if (!guest) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <p className="text-slate-500">Guest introuvable</p>
        <button onClick={() => navigate("/guests")} className="text-primary text-sm hover:underline">
          ← Retour aux guests
        </button>
      </div>
    );
  }

  const {
    analysis,
    showcaseVisits,
    opportunityVisits,
    pitchVisits,
    trainingVisits,
    activityHistory,
    aiInsights,
    conversionProbability,
  } = deriveGuestData(guest);

  const roomData = [
    { name: "Showcase", value: showcaseVisits },
    { name: "Opportunity", value: opportunityVisits },
    { name: "Pitch", value: pitchVisits },
    { name: "Training", value: trainingVisits },
  ].filter((d) => d.value > 0);

  const COLORS = ["#0ea5a8", "#0f766e", "#ef4444", "#0891b2"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-12"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/guests")}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors group"
        >
          <div className="p-2 rounded-lg group-hover:bg-slate-100 transition-colors">
            <ArrowLeft size={20} />
          </div>
          <span className="font-medium">Retour aux Guests</span>
        </button>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors">
            Modifier Profil
          </button>
          <button className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90 transition-colors shadow-sm">
            Envoyer Offre
          </button>
        </div>
      </div>

      {/* Profile Summary */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
        <div className="flex flex-col md:flex-row gap-8 items-start">
          <div className="w-24 h-24 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground text-3xl font-bold shrink-0">
            {guest.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
          </div>
          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-bold text-slate-900">{guest.name}</h1>
              <span className="px-3 py-1 rounded-full text-xs font-semibold border bg-accent text-accent-foreground border-border">
                {guest.domain}
              </span>
              {analysis.level === "hot" && (
                <span className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500 text-white">
                  <Zap size={12} fill="currentColor" />
                  HOT
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-4 gap-x-8">
              <div className="flex items-center gap-2 text-slate-600">
                <Building2 size={16} className="text-slate-400" />
                <span className="text-sm">{guest.type_client}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Globe size={16} className="text-slate-400" />
                <span className="text-sm">{guest.domain}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Briefcase size={16} className="text-slate-400" />
                <span className="text-sm">{guest.id}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar size={16} className="text-slate-400" />
                <span className="text-sm">Créé le {guest.created_at}</span>
              </div>
            </div>
          </div>

          <div className="w-full md:w-auto p-4 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Engagement Level</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 w-32 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full",
                    analysis.score > 70 ? "bg-emerald-500" : analysis.score > 40 ? "bg-orange-500" : "bg-rose-500"
                  )}
                  style={{ width: `${analysis.score}%` }}
                />
              </div>
              <span className="text-lg font-bold text-slate-900">{analysis.level.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Activity} label="Score IA" value={analysis.score} subValue="/100" color="bg-blue-50 text-blue-600" />
        <StatCard icon={Clock} label="Session" value={`${guest.session_duration}m`} subValue="durée totale" color="bg-red-50 text-red-700" />
        <StatCard icon={MessageSquare} label="Interactions" value={guest.interaction_count} subValue="actions" color="bg-emerald-50 text-emerald-600" />
        <StatCard icon={Mic} label="Voice Usage" value={guest.voice_interaction_time} subValue="min" color="bg-orange-50 text-orange-600" />
        <StatCard icon={TrendingUp} label="Conversion Prob." value={`${conversionProbability}%`} subValue="probabilité" color="bg-red-50 text-red-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Charts Section */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Room Observation</h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={roomData} cx="50%" cy="50%" innerRadius={70} outerRadius={100} paddingAngle={5} dataKey="value">
                    {roomData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {roomData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-xs text-slate-500 font-medium">{entry.name}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Engagement Trend</h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activityHistory}>
                  <defs>
                    <linearGradient id="colorInteractions" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5a8" stopOpacity={0.12} />
                      <stop offset="95%" stopColor="#0ea5a8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#64748b" }} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)" }} />
                  <Area type="monotone" dataKey="interactions" stroke="#0ea5a8" strokeWidth={3} fillOpacity={1} fill="url(#colorInteractions)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-6">Navigation Path</h3>
            <div className="flex flex-wrap items-center gap-2">
              {guest.navigation_path.map((step, index) => (
                <div key={`${step}-${index}`} className="flex items-center gap-2">
                  <span className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                    {step}
                  </span>
                  {index < guest.navigation_path.length - 1 && (
                    <ChevronRight size={14} className="text-slate-400" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          {/* AI Insights */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-primary" />
              AI Insights
            </h3>
            <div className="space-y-4">
              {aiInsights.map((insight, idx) => (
                <div key={idx} className="flex gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="p-2 rounded-lg shrink-0 h-fit bg-red-50 text-red-700">
                    <Activity size={18} />
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{insight}</p>
                </div>
              ))}
              {aiInsights.length === 0 && (
                <p className="text-sm text-slate-500 italic">Pas assez de données pour l'analyse IA.</p>
              )}
            </div>
          </div>

          {/* Recommended Actions */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Zap size={20} className="text-amber-500" />
              Actions Recommandées
            </h3>
            <div className="space-y-3">
              {analysis.level === "hot" ? (
                <>
                  <button className="w-full flex items-center justify-between p-3 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors group">
                    <span className="text-sm font-bold">Contacter Maintenant</span>
                    <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                  <button className="w-full flex items-center justify-between p-3 rounded-xl bg-red-50 text-red-700 hover:bg-red-100 transition-colors group">
                    <span className="text-sm font-bold">Envoyer Offre Personnalisée</span>
                    <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                  </button>
                </>
              ) : analysis.level === "cold" ? (
                <button className="w-full flex items-center justify-between p-3 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors group">
                  <span className="text-sm font-bold">Envoyer Intro de Bienvenue</span>
                  <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              ) : (
                <button className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 text-slate-700 hover:bg-slate-100 transition-colors group">
                  <span className="text-sm font-bold">Surveiller l'Activité</span>
                  <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>
              )}
              <button className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors group">
                <span className="text-sm font-bold">Planifier Follow-up</span>
                <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* AI Generated Offer */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden max-w-3xl mx-auto">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Offre Generee
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-900 text-white border border-slate-900">
                  Powered by Groq
                </span>
              </div>
              <h3 className="text-4xl font-bold text-slate-900">
                {recommendation?.recommended_pack?.pack_name ?? "No generated pack yet"}
              </h3>
              <p className="text-sm text-slate-600 mt-1">
                Tier {recommendation?.tier ?? "-"} · Pack code {recommendation?.recommended_pack?.pack_code ?? "-"}
              </p>
              <p className="text-xs text-slate-500 mt-2">User: {guest.name} · Domain: {guest.domain}</p>
            </div>

            <div className="p-6 space-y-6">
              <div className="border-b border-slate-200 pb-4">
                <h4 className="text-xs uppercase font-bold text-slate-500 tracking-wide mb-2">Sessions</h4>
                <p className="text-4xl font-bold text-slate-900">{recommendation?.recommended_pack?.nb_rooms ?? "-"}</p>
              </div>

              <div>
                <h4 className="text-xs uppercase font-bold text-slate-500 tracking-wide mb-3">Services</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(recommendation?.recommended_pack?.services ?? []).map((service) => (
                    <div key={service} className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                      <p className="font-bold text-slate-900 flex items-center gap-2">✅ {service}</p>
                      <p className="text-sm text-slate-700 mt-1">Price: $0</p>
                      <p className="text-xs text-slate-600 mt-2">"{recommendation?.recommended_pack?.reason ?? ""}"</p>
                    </div>
                  ))}
                  {!recommendation?.recommended_pack?.services?.length && (
                    <div className="rounded-xl border border-slate-200 p-4 bg-slate-50 text-sm text-slate-500">
                      No services available.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-xs uppercase font-bold text-slate-500 tracking-wide mb-3">KPIs Improved</h4>
                <div className="flex flex-wrap gap-2">
                  {(recommendation?.score_breakdown?.top_room ? [recommendation.score_breakdown.top_room, recommendation.score_breakdown.top_room_by_interactions] : [])
                    .filter((kpi, idx, arr) => arr.indexOf(kpi) === idx)
                    .map((kpi, idx) => (
                    <span key={`${kpi}-${idx}`} className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                      {kpi}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-xs uppercase font-bold text-red-500 tracking-wide mb-1">Reason of Choice</p>
                <p className="text-sm text-red-900 italic">
                  "{recommendation?.recommended_pack?.reason ?? "Recommendation not available yet."}"
                </p>
              </div>

              <div className="border-y border-slate-200 py-4 flex items-center justify-between">
                <p className="text-sm uppercase tracking-wider font-bold text-slate-500">Total Price</p>
                <p className="text-2xl font-black text-slate-900">$0</p>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase font-bold text-slate-500 tracking-wide mb-1">Summary</p>
                <p className="text-sm text-slate-700">
                  {recommendation?.recommended_pack?.reason ?? "Recommendation not available yet."}
                </p>
              </div>

              {recommendationError ? <p className="text-xs text-destructive">Recommendation error: {recommendationError}</p> : null}
              {saveError ? <p className="text-xs text-destructive">Save error: {saveError}</p> : null}

              <div className="flex flex-wrap gap-2 justify-end">
                {canRegenerate("pending") && (
                  <button
                    onClick={() => {
                      if (id) {
                        setSavedPack(false);
                        void loadRecommendation(id);
                      }
                    }}
                    disabled={recommendationLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {recommendationLoading ? "Loading..." : "Regenerate"}
                  </button>
                )}
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
                >
                  <FileDown className="h-4 w-4" /> Download PDF
                </button>
                <button
                  onClick={() => void saveCurrentPack()}
                  disabled={savedPack || savingPack || !recommendation}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${
                    savedPack ? "bg-emerald-100 text-emerald-700" : "bg-emerald-600 text-white hover:bg-emerald-700"
                  } disabled:opacity-70`}
                >
                  <CheckCircle2 className="h-4 w-4" /> {savedPack ? "Saved" : savingPack ? "Saving..." : "Save Pack"}
                </button>
              </div>
              {savedPack ? <p className="text-sm text-emerald-700 font-medium text-right">Pack successfully saved</p> : null}
            </div>
          </div>
        </div>
      </div>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="fixed bottom-8 right-8 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            aria-label="Ouvrir les notes admin"
          >
            <MessageSquare className="h-6 w-6" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="left"
          align="end"
          sideOffset={16}
          className="w-96 p-0 shadow-xl border-slate-200"
        >
          <div className="border-b border-border px-4 py-3">
            <h4 className="font-semibold text-sm text-foreground">Admin Notes</h4>
            <p className="text-xs text-muted-foreground mt-0.5">{guest.name}</p>
          </div>
          <div className="p-4">
            <Textarea
              placeholder="Ajouter une note pour ce guest…"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              className="min-h-[140px] resize-y text-sm"
            />
            <button
              type="button"
              className="mt-3 w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Enregistrer la note
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </motion.div>
  );
}
