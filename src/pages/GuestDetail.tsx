import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { guests } from "@/lib/mock-data";
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
  Edit3,
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

  const activityHistory = [
    { date: "Sem 1", interactions: Math.round(guest.interaction_count * 0.15) },
    { date: "Sem 2", interactions: Math.round(guest.interaction_count * 0.25) },
    { date: "Sem 3", interactions: Math.round(guest.interaction_count * 0.35) },
    { date: "Sem 4", interactions: Math.round(guest.interaction_count * 0.25) },
  ];

  const aiInsights: string[] = [];
  if (guest.voice_interaction_time > 2) aiInsights.push(`Forte utilisation vocale (${guest.voice_interaction_time} min) — profil orienté networking.`);
  if (guest.rooms_viewed.length >= 3) aiInsights.push(`A exploré ${guest.rooms_viewed.length} rooms — intérêt multi-services confirmé.`);
  if (guest.idle_time > 1) aiInsights.push(`Temps d'inactivité de ${guest.idle_time} min détecté — risque de désengagement.`);
  if (analysis.score > 70) aiInsights.push("Score élevé — candidat prioritaire pour conversion rapide.");
  if (guest.customization_time > 1) aiInsights.push(`Temps de personnalisation de ${guest.customization_time} min — fort intérêt produit.`);

  const generatedOffer = {
    status: analysis.level === "hot" ? "READY" : analysis.level === "warm" ? "DRAFT" : "PENDING",
    title: `Pack ${analysis.recommended_room}`,
    sessionsIncluded: analysis.score > 70 ? 12 : analysis.score >= 40 ? 6 : 3,
    roomsIncluded: analysis.score > 70
      ? ["Training Center", "Showcase Room", analysis.recommended_room].filter((v, i, a) => a.indexOf(v) === i)
      : [analysis.recommended_room],
    reason: analysis.offer,
    confidenceScore: Math.min(99, analysis.score + 10),
    priorityLevel: analysis.level === "hot" ? "Critical" : analysis.level === "warm" ? "High" : "Normal",
    recommendedAction: analysis.level === "hot" ? "Envoyer proposition commerciale" : "Planifier démo personnalisée",
  };

  return {
    analysis,
    showcaseVisits,
    opportunityVisits,
    pitchVisits,
    trainingVisits,
    activityHistory,
    aiInsights,
    generatedOffer,
    conversionProbability: Math.min(99, analysis.score + 5),
  };
}

export default function GuestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [adminNote, setAdminNote] = useState("");

  const guest = guests.find((g) => g.id === id);
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
    generatedOffer,
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
        <StatCard icon={Building2} label="Showcase" value={showcaseVisits} subValue="min" color="bg-teal-50 text-teal-700" />
        <StatCard icon={Zap} label="Opportunity" value={opportunityVisits} subValue="min" color="bg-amber-50 text-amber-600" />
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

          {/* AI Generated Offer — PackageManagement style */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center justify-between mb-2">
                <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-500 uppercase">
                  {generatedOffer.status}
                </span>
                <button className="p-1.5 text-slate-400 hover:text-primary hover:bg-white rounded-md transition-all">
                  <Edit3 size={14} />
                </button>
              </div>
              <h3 className="text-xl font-bold text-slate-900">{generatedOffer.title}</h3>
              <p className="text-xs text-slate-500 mt-1">For: {guest.name} ({guest.type_client})</p>
            </div>

            <div className="p-6 flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Sessions</span>
                <span className="text-sm font-bold text-slate-900">{generatedOffer.sessionsIncluded}</span>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-400 uppercase mb-2">Included Rooms</p>
                <div className="flex flex-wrap gap-2">
                  {generatedOffer.roomsIncluded.map((room, idx) => (
                    <span key={idx} className="px-2 py-1 bg-red-50 text-red-700 rounded text-[10px] font-medium">
                      {room}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                <p className="text-[10px] font-bold text-red-500 uppercase mb-1">AI Reason</p>
                <p className="text-xs text-red-800 italic">"{generatedOffer.reason}"</p>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Confidence</p>
                <p className="text-lg font-black text-slate-900">{generatedOffer.confidenceScore}%</p>
              </div>
              <button className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                Review Offer
              </button>
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
