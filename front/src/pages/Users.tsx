import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { users, MOCK_GUESTS } from "@/lib/mock-data";
import { analyzeGuest, getScoreBgColor } from "@/lib/scoring";
import { getOfferStatusBadgeClasses, getOfferStatusLabel } from "@/lib/offer-status";
import { Guest, GuestScore, GuestWithOffer, UserRole, UserSource } from "@/lib/types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import {
  Search, Sparkles, X, Mail, ChevronRight, Package, Brain, Layers,
  Instagram, Youtube, Linkedin, Loader2, CheckCircle2, Clock,
  MousePointerClick, Mic, Eye, TrendingUp, AlertTriangle
} from "lucide-react";

// ─── GEMINI CONFIG ───────────────────────────────────────────────────────────
const GEMINI_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY ?? "").trim();
const USE_MOCK_MODE = false;

// ─── GEMINI OFFER TYPE ───────────────────────────────────────────────────────
interface GeminiOffer {
  packName: string;
  packCategory: "Starter" | "Growth" | "Premium" | "Enterprise";
  sessions: number;
  sessionDuration: string;
  rooms: string[];
  scoreIA: number;
  scoreDomaine: string;
  voiceRecommendation: string;
  reasoning: string;
  roomObservation: string;
  upsellTip: string;
  urgency: "low" | "medium" | "high";
  estimatedValue: string;
  keyBenefit: string;
}

// ─── MOCK OFFER GENERATOR ────────────────────────────────────────────────────
function generateMockOffer(guest: Guest): GeminiOffer {
  const rooms = guest.rooms_viewed.slice(0, 2) || ['Training Center', 'Pitch Room'];
  const categories: ('Starter' | 'Growth' | 'Premium' | 'Enterprise')[] = ['Starter', 'Growth', 'Premium', 'Enterprise'];
  const category = categories[Math.floor(Math.random() * categories.length)];
  const urgencies: ('low' | 'medium' | 'high')[] = ['low', 'medium', 'high'];
  const urgency = urgencies[Math.floor(Math.random() * urgencies.length)];
  
  return {
    packName: `Pack ${category} ${guest.domain}`,
    packCategory: category,
    sessions: Math.floor(Math.random() * 15) + 5,
    sessionDuration: '45 min',
    rooms,
    scoreIA: Math.floor(Math.random() * 40) + 60,
    scoreDomaine: guest.domain,
    voiceRecommendation: `Utilisez la fonctionnalité vocale pour un engagement ${guest.voice_interaction_time > 2 ? 'intensif' : 'modéré'} avec ce client.`,
    reasoning: `Basé sur ${guest.interaction_count} interactions et ${guest.session_duration} min de session. Client très engagé dans ${guest.most_viewed_room}.`,
    roomObservation: `Forte activité dans ${guest.most_viewed_room} avec ${Object.values(guest.room_click_rate).reduce((a, b) => a + b, 0)} clics totaux.`,
    upsellTip: `Proposez une session démo personnalisée pour augmenter l'engagement.`,
    urgency,
    estimatedValue: `${Math.floor(Math.random() * 3000) + 1200} TND`,
    keyBenefit: `Augmentez votre engagement XR avec nos formations immersives personnalisées.`,
  };
}

// ─── GEMINI API CALL ─────────────────────────────────────────────────────────
async function callGeminiForOffer(guest: Guest, guestWithOffer?: GuestWithOffer): Promise<GeminiOffer> {
  // Use mock mode if enabled
  if (USE_MOCK_MODE) {
    return new Promise(r => setTimeout(() => r(generateMockOffer(guest)), 1500));
  }
  if (!GEMINI_API_KEY) {
    throw new Error("Missing VITE_GEMINI_API_KEY");
  }
  const totalClicks = Object.values(guest.room_click_rate).reduce((a, b) => a + b, 0);
  const roomObsDetails = Object.entries(guest.room_observation_time)
    .map(([room, time]) => `${room}: ${time} min`).join(", ") || "Aucune donnée";
  const roomClickDetails = Object.entries(guest.room_click_rate)
    .map(([room, clicks]) => `${room}: ${clicks} clics`).join(", ") || "Aucun clic";
  const activityRate = Math.round(
    ((guest.session_duration - guest.idle_time) / Math.max(guest.session_duration, 1)) * 100
  );

  const prompt = `
Tu es un expert en vente de formations XR/VR et espaces de coworking immersif (Intelverse).
Analyse les données comportementales détaillées de ce visiteur et génère une offre commerciale IA ultra-personnalisée.

════════════════════════════════════════
PROFIL CLIENT
════════════════════════════════════════
ID: ${guest.id}
Entreprise: ${guestWithOffer?.company || guest.name}
Contact: ${guestWithOffer?.fullName || guest.name}
Secteur/Domaine: ${guest.domain}
Type client: ${guest.type_client}
Rôle: ${guest.role}
Source acquisition: ${guest.source}

════════════════════════════════════════
SESSION — DONNÉES TEMPORELLES
════════════════════════════════════════
Durée totale session: ${guest.session_duration} minutes
Temps idle (inactivité): ${guest.idle_time} minutes
Temps de customisation: ${guest.customization_time} minutes
Taux d'activité réelle: ${activityRate}%

════════════════════════════════════════
INTERACTIONS & NAVIGATION
════════════════════════════════════════
Nombre total d'interactions: ${guest.interaction_count}
Nombre total de clics (actions): ${totalClicks}
Parcours de navigation: ${guest.navigation_path.join(" → ")}
Rooms visitées: ${guest.rooms_viewed.join(", ") || "Aucune"}
Room la plus consultée: ${guest.most_viewed_room}
Temps d'observation par room: ${roomObsDetails}
Clics par room: ${roomClickDetails}

════════════════════════════════════════
VOICE USAGE
════════════════════════════════════════
Temps d'interaction vocale: ${guest.voice_interaction_time} minutes
Proportion vocale: ${Math.round((guest.voice_interaction_time / Math.max(guest.session_duration, 1)) * 100)}% de la session
Type d'usage: ${guest.voice_interaction_time > 3 ? "Usage vocal intensif" : guest.voice_interaction_time > 0 ? "Usage vocal modéré" : "Aucune interaction vocale"}

════════════════════════════════════════
SCORE & STATUT ACTUEL
════════════════════════════════════════
Statut actuel: ${guest.status}
Date de création: ${guest.created_at}
${guestWithOffer ? `Offre existante: ${guestWithOffer.generatedOffer.title} (Confiance: ${guestWithOffer.generatedOffer.confidenceScore}%)` : "Aucune offre générée précédemment"}

════════════════════════════════════════
INSTRUCTIONS
════════════════════════════════════════
Sur la base de TOUTES ces données, génère une offre personnalisée.
Réponds UNIQUEMENT avec ce JSON valide, sans markdown ni texte supplémentaire:

{
  "packName": "Nom commercial du pack (3-5 mots, accrocheur)",
  "packCategory": "Starter | Growth | Premium | Enterprise",
  "sessions": <nombre entier entre 1 et 25>,
  "sessionDuration": "<durée recommandée par session, ex: 45 min>",
  "rooms": ["Nom room 1", "Nom room 2"],
  "scoreIA": <score entier entre 40 et 98>,
  "scoreDomaine": "<domaine principal ciblé, ex: Formation XR, Recrutement Immersif>",
  "voiceRecommendation": "<recommandation spécifique sur l'usage vocal pour ce client en 1 phrase>",
  "reasoning": "<analyse comportementale + justification de l'offre en 2-3 phrases>",
  "roomObservation": "<observation précise du comportement dans les rooms en 1-2 phrases>",
  "upsellTip": "<conseil commercial actionnable pour augmenter l'engagement en 1 phrase>",
  "urgency": "low | medium | high",
  "estimatedValue": "<valeur estimée du contrat, ex: 1 200 TND>",
  "keyBenefit": "<bénéfice clé en une phrase courte et percutante>"
}
`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.72, maxOutputTokens: 900 },
        safetySettings: [
          { category: "HARM_CATEGORY_UNSPECIFIED", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DEROGATORY", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_TOXICITY", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_VIOLENCE", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUAL", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_MEDICAL", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS", threshold: "BLOCK_NONE" },
        ],
      }),
    }
  );

  if (!res.ok) {
    const error = await res.text();
    console.error("Gemini API Error:", { status: res.status, error });
    throw new Error(`Gemini API error ${res.status}: ${error}`);
  }
  const data = await res.json();
  console.log("Gemini API Response:", data);
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = raw.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const statusSteps = ['Créé', 'Lobby', 'KPIs collectés', 'Offre envoyée', 'Converti'] as const;

const getGuestStatusBadgeClasses = (status: string) => {
  if (status === 'Offre envoyée') return 'bg-blue-100 text-blue-700 border-blue-200';
  if (status === 'Converti') return 'bg-green-100 text-green-700 border-green-200';
  if (status === 'Supprimée') return 'bg-red-100 text-red-700 border-red-200';
  return 'bg-yellow-100 text-yellow-700 border-yellow-200';
};

const getGuestStatusLabel = (status: string) => {
  if (status === 'Offre envoyée') return '🔵 Offre Envoyée';
  if (status === 'Converti') return '🟢 Offre Acceptée';
  if (status === 'Supprimée') return '🔴 Offre Supprimée';
  return '🟡 Offre Générée';
};

const confidenceColor = (score: number) => {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  return 'text-red-500';
};

const urgencyConfig = {
  low: { label: "Faible", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  medium: { label: "Moyenne", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  high: { label: "Haute 🔥", cls: "bg-red-100 text-red-700 border-red-200" },
};

const categoryConfig: Record<string, string> = {
  Starter: "bg-slate-200 text-slate-700",
  Growth: "bg-teal-100 text-teal-700",
  Premium: "bg-violet-100 text-violet-700",
  Enterprise: "bg-amber-100 text-amber-700",
};

const roleBadgeClasses: Record<UserRole, string> = {
  Guest: 'bg-slate-100 text-slate-700 border-slate-200',
  Client: 'bg-blue-100 text-blue-700 border-blue-200',
  Partner: 'bg-purple-100 text-purple-700 border-purple-200',
};

const sourceBadgeClasses: Record<UserSource, string> = {
  LinkedIn: 'bg-blue-100 text-blue-700 border-blue-200',
  Facebook: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Instagram: 'bg-pink-100 text-pink-700 border-pink-200',
  Twitter: 'bg-sky-100 text-sky-700 border-sky-200',
  YouTube: 'bg-red-100 text-red-700 border-red-200',
};

const sourceFilters: Array<'all' | UserSource> = ['all', 'LinkedIn', 'Facebook', 'Instagram', 'Twitter', 'YouTube'];

const getSourceIcon = (source: UserSource) => {
  if (source === 'LinkedIn') return <Linkedin className="h-3 w-3" />;
  if (source === 'Facebook') return <span className="text-[11px] font-bold leading-none">f</span>;
  if (source === 'Instagram') return <Instagram className="h-3 w-3" />;
  if (source === 'Twitter') return <span className="text-[11px] font-bold leading-none">X</span>;
  return <Youtube className="h-3 w-3" />;
};

const getOfferActionState = (guest: Guest, guestWithOffer: GuestWithOffer | undefined) => {
  if (guest.status === 'Converti') return 'view';
  if (!guestWithOffer) return 'generate';
  const s = String(guestWithOffer.generatedOffer.status);
  if (s === 'accepted' || s === 'sent') return 'view';
  return 'generate';
};

const shouldHideOfferCta = (status: string) => {
  const s = String(status);
  return ['sent', 'accepted', 'rejected', 'Offre Envoyée', 'Offre Acceptée', 'Offre Refusée'].includes(s);
};

// ─── SCORE RING ───────────────────────────────────────────────────────────────
function ScoreRing({ value, size = 60, stroke = 5 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const color = value >= 80 ? '#10B981' : value >= 60 ? '#F59E0B' : '#EF4444';
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${(value / 100) * circ} ${circ}`} />
    </svg>
  );
}

// ─── STAT CHIP ────────────────────────────────────────────────────────────────
function StatChip({ icon, label, value, accent = "bg-slate-50 border-slate-100" }: {
  icon: React.ReactNode; label: string; value: string; accent?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 p-3 rounded-xl border ${accent}`}>
      <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
        {icon} {label}
      </div>
      <div className="text-slate-800 font-bold text-sm">{value}</div>
    </div>
  );
}

// ─── SEND BUTTON ─────────────────────────────────────────────────────────────
function SendButton() {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const handle = async () => {
    setSending(true);
    await new Promise(r => setTimeout(r, 1800));
    setSending(false);
    setSent(true);
  };
  return (
    <button onClick={handle} disabled={sending || sent}
      className={`w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all ${sent ? 'bg-green-500 text-white' : 'bg-primary hover:opacity-90 text-primary-foreground'} disabled:opacity-70`}>
      {sending ? <><Loader2 className="h-4 w-4 animate-spin" />Envoi en cours...</>
        : sent ? <><CheckCircle2 className="h-4 w-4" />Offre envoyée !</>
          : <><Mail className="h-4 w-4" />Envoyer via Email</>}
    </button>
  );
}

// ─── GEMINI OFFER MODAL ───────────────────────────────────────────────────────
function GeminiOfferModal({ guest, aiGuest, offer, onClose }: {
  guest: Guest; aiGuest?: GuestWithOffer; offer: GeminiOffer; onClose: () => void;
}) {
  const urg = urgencyConfig[offer.urgency] || urgencyConfig.medium;
  const catCls = categoryConfig[offer.packCategory] || categoryConfig.Growth;
  const actRate = Math.round(((guest.session_duration - guest.idle_time) / Math.max(guest.session_duration, 1)) * 100);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-slide-up max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}>

        {/* HEADER */}
        <div className="bg-gradient-to-br from-primary to-warning p-5 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <h3 className="font-bold text-white text-base">Pack IA Généré</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${catCls}`}>
                    {offer.packCategory}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${urg.cls}`}>
                    Urgence {urg.label}
                  </span>
                </div>
                <p className="text-white/70 text-xs">Powered by Gemini AI · Offre personnalisée</p>
              </div>
            </div>
            <div className="flex flex-col items-center shrink-0">
              <div className="relative">
                <ScoreRing value={offer.scoreIA} size={52} stroke={5} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white font-black text-sm">{offer.scoreIA}</span>
                </div>
              </div>
              <span className="text-white/60 text-[9px] font-semibold mt-0.5">SCORE IA</span>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* BODY */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* CLIENT */}
          <div className="flex items-start justify-between bg-slate-50 rounded-xl p-3 border border-slate-100">
            <div>
              <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Client</p>
              <p className="font-bold text-slate-800">{aiGuest?.fullName || guest.name}</p>
              <p className="text-xs text-slate-500">{aiGuest?.company || guest.name}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-slate-400 uppercase font-bold mb-0.5">Domaine IA</p>
              <p className="text-primary font-bold text-sm">{offer.scoreDomaine}</p>
              <p className="text-slate-400 text-xs">{guest.domain}</p>
            </div>
          </div>

          {/* ANALYTICS GRID */}
          <div>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" /> Données comportementales analysées
            </p>
            <div className="grid grid-cols-3 gap-2">
              <StatChip icon={<Clock className="h-3 w-3" />} label="Durée session"
                value={`${guest.session_duration} min`} accent="bg-blue-50 border-blue-100" />
              <StatChip icon={<MousePointerClick className="h-3 w-3" />} label="Interactions"
                value={`${guest.interaction_count} events`} accent="bg-teal-50 border-teal-100" />
              <StatChip icon={<Mic className="h-3 w-3" />} label="Voice usage"
                value={`${guest.voice_interaction_time} min`} accent="bg-violet-50 border-violet-100" />
              <StatChip icon={<Eye className="h-3 w-3" />} label="Rooms visitées"
                value={`${guest.rooms_viewed.length} room${guest.rooms_viewed.length !== 1 ? 's' : ''}`} />
              <StatChip icon={<AlertTriangle className="h-3 w-3" />} label="Idle time"
                value={`${guest.idle_time} min`}
                accent={guest.idle_time > 3 ? "bg-red-50 border-red-100" : "bg-slate-50 border-slate-100"} />
              <StatChip icon={<TrendingUp className="h-3 w-3" />} label="Activité réelle"
                value={`${actRate}%`}
                accent={actRate > 70 ? "bg-green-50 border-green-100" : "bg-amber-50 border-amber-100"} />
            </div>
          </div>

          {/* PACK NAME */}
          <div className="bg-red-50 rounded-xl p-4 border border-red-100">
            <div className="flex items-center gap-2 mb-1.5">
              <Package className="h-4 w-4 text-red-500" />
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Nom du Pack</p>
            </div>
            <p className="text-xl font-black text-red-900 mb-1">{offer.packName}</p>
            <p className="text-xs text-red-600 italic">{offer.keyBenefit}</p>
          </div>

          {/* SESSIONS + ROOMS + VALUE */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
              <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Sessions</p>
              <p className="text-2xl font-black text-slate-800">{offer.sessions}</p>
              <p className="text-[10px] text-slate-400">{offer.sessionDuration}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="text-[10px] text-slate-400 uppercase font-bold mb-1.5">Rooms incluses</p>
              <div className="flex flex-col gap-1">
                {offer.rooms.map((room, i) => (
                  <span key={i} className="flex items-center gap-1 text-[10px] font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
                    <Layers className="h-2.5 w-2.5" />{room}
                  </span>
                ))}
              </div>
            </div>
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 text-center flex flex-col justify-center">
              <p className="text-[10px] text-emerald-500 uppercase font-bold mb-1">Valeur estimée</p>
              <p className="text-sm font-black text-emerald-700 leading-tight">{offer.estimatedValue}</p>
            </div>
          </div>

          {/* ROOM OBSERVATION */}
          <div className="bg-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1.5">
              <Eye className="h-3.5 w-3.5 text-slate-400" />
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Observation Room</p>
            </div>
            <p className="text-slate-300 text-xs italic leading-relaxed">"{offer.roomObservation}"</p>
          </div>

          {/* VOICE RECOMMENDATION */}
          <div className="bg-violet-50 rounded-xl p-4 border border-violet-100">
            <div className="flex items-center gap-2 mb-1.5">
              <Mic className="h-3.5 w-3.5 text-violet-500" />
              <p className="text-[10px] font-bold text-violet-500 uppercase tracking-wider">Recommandation Voice</p>
            </div>
            <p className="text-violet-800 text-xs leading-relaxed">{offer.voiceRecommendation}</p>
          </div>

          {/* AI REASONING */}
          <div className="bg-red-50 rounded-xl p-4 border border-red-100">
            <div className="flex items-center gap-2 mb-1.5">
              <Brain className="h-4 w-4 text-red-500" />
              <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Raisonnement IA</p>
            </div>
            <p className="text-red-800 text-xs italic leading-relaxed">"{offer.reasoning}"</p>
          </div>

          {/* UPSELL TIP */}
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100 flex gap-2.5">
            <span className="text-lg shrink-0">💡</span>
            <div>
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-0.5">Conseil Commercial</p>
              <p className="text-amber-800 text-xs leading-relaxed">{offer.upsellTip}</p>
            </div>
          </div>

          {/* CONFIDENCE BAR */}
          <div className="flex items-center justify-between px-1">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Score de confiance</p>
              <p className={`text-2xl font-black ${confidenceColor(offer.scoreIA)}`}>{offer.scoreIA}%</p>
            </div>
            <div className="w-36 bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div className="h-2.5 rounded-full bg-gradient-to-r from-primary to-warning"
                style={{ width: `${offer.scoreIA}%` }} />
            </div>
          </div>

          <SendButton />
        </div>
      </div>
    </div>
  );
}

// ─── STATIC OFFER MODAL ───────────────────────────────────────────────────────
function StaticOfferModal({ guest, aiGuest, analysis, onClose }: {
  guest: Guest; aiGuest?: GuestWithOffer; analysis: GuestScore; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-primary to-warning p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Pack IA Généré</h3>
                <p className="text-red-100 text-xs">Offre personnalisée pour ce client</p>
              </div>
            </div>
            <button onClick={onClose} className="text-white/70 hover:text-white"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {aiGuest ? (
          <div className="p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 uppercase font-bold mb-0.5">Client</p>
                <p className="font-semibold text-slate-800">{aiGuest.fullName}</p>
                <p className="text-xs text-slate-500">{aiGuest.company}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${getOfferStatusBadgeClasses(aiGuest.generatedOffer.status)}`}>
                {getOfferStatusLabel(aiGuest.generatedOffer.status)}
              </span>
            </div>
            <div className="bg-red-50 rounded-xl p-4 border border-red-100">
              <div className="flex items-center gap-2 mb-1">
                <Package className="h-4 w-4 text-red-600" />
                <p className="text-[10px] font-bold text-red-500 uppercase">Nom du Pack</p>
              </div>
              <p className="text-lg font-black text-red-900">{aiGuest.generatedOffer.title}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Sessions incluses</p>
                <p className="text-2xl font-black text-slate-900">{aiGuest.generatedOffer.sessionsIncluded}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">Rooms incluses</p>
                <div className="flex flex-wrap gap-1.5">
                  {aiGuest.generatedOffer.roomsIncluded.map((room, idx) => (
                    <span key={idx} className="flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded text-[10px] font-medium">
                      <Layers className="h-2.5 w-2.5" />{room}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-red-50 rounded-xl p-4 border border-red-100">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-4 w-4 text-red-600" />
                <p className="text-[10px] font-bold text-red-500 uppercase">Raisonnement IA</p>
              </div>
              <p className="text-xs text-red-800 italic leading-relaxed">"{aiGuest.generatedOffer.reason}"</p>
            </div>
            <div className="flex items-center justify-between px-1">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase">Score de confiance</p>
                <p className={`text-2xl font-black ${confidenceColor(aiGuest.generatedOffer.confidenceScore)}`}>
                  {aiGuest.generatedOffer.confidenceScore}%
                </p>
              </div>
              <div className="w-32 bg-slate-100 rounded-full h-2.5">
                <div className="h-2.5 rounded-full bg-gradient-to-r from-primary to-warning"
                  style={{ width: `${aiGuest.generatedOffer.confidenceScore}%` }} />
              </div>
            </div>
            {!shouldHideOfferCta(String(aiGuest.generatedOffer.status)) && <SendButton />}
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">Guest :</span>
              <span className="font-medium text-slate-800">{guest.name}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">Score :</span>
              <span className={`font-mono font-bold px-2 py-0.5 rounded ${getScoreBgColor(analysis.level)}`}>
                {analysis.score}/100
              </span>
            </div>
            <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
              <p className="text-sm text-slate-700 leading-relaxed">{analysis.offer}</p>
            </div>
            <SendButton />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function Users() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<'all' | UserSource>('all');
  const [selectedGuest, setSelectedGuest] = useState<Guest | null>(null);

  const [staticModal, setStaticModal] = useState<{ guest: Guest; analysis: GuestScore; aiGuest?: GuestWithOffer } | null>(null);
  const [geminiModal, setGeminiModal] = useState<{ guest: Guest; aiGuest?: GuestWithOffer; offer: GeminiOffer } | null>(null);

  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [errorIds, setErrorIds] = useState<Record<string, string>>({});

  const filtered = users.filter(g => {
    const matchSearch = g.name.toLowerCase().includes(search.toLowerCase()) || g.id.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === 'all' || g.role === filterRole;
    const matchSource = filterSource === 'all' || g.source === filterSource;
    return matchSearch && matchRole && matchSource;
  });

  const handleGenerateOffer = async (
    e: React.MouseEvent,
    guest: Guest,
    analysis: GuestScore,
    aiGuest?: GuestWithOffer
  ) => {
    e.stopPropagation();

    // "view" mode → static modal
    if (aiGuest && getOfferActionState(guest, aiGuest) === 'view') {
      setStaticModal({ guest, analysis, aiGuest });
      return;
    }

    // "generate" mode → call Gemini
    setGeneratingIds(prev => new Set(prev).add(guest.id));
    setErrorIds(prev => { const n = { ...prev }; delete n[guest.id]; return n; });

    try {
      const offer = await callGeminiForOffer(guest, aiGuest);
      setGeminiModal({ guest, aiGuest, offer });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur Gemini inconnue";
      const normalized = message.toLowerCase();
      const shortMessage = normalized.includes("quota") || normalized.includes("resource_exhausted") || normalized.includes("429")
        ? "Quota Gemini dépassé (429)"
        : normalized.includes("api key") || normalized.includes("permission_denied") || normalized.includes("403")
          ? "Clé API Gemini invalide ou non autorisée"
          : "Erreur Gemini — ouvrez la console pour le détail";
      setErrorIds(prev => ({ ...prev, [guest.id]: shortMessage }));
    } finally {
      setGeneratingIds(prev => { const n = new Set(prev); n.delete(guest.id); return n; });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground">Unified list of guests, clients and partners.</p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input type="text" placeholder="Search a user..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase pt-2">Role:</span>
            {['all', 'Guest', 'Client', 'Partner'].map(r => (
              <button key={r} onClick={() => setFilterRole(r)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${filterRole === r ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
                {r === 'all' ? 'All Roles' : r}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground uppercase pt-2">Source:</span>
            {sourceFilters.map(source => (
              <button key={source} onClick={() => setFilterSource(source)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${filterSource === source ? 'bg-primary text-primary-foreground' : 'bg-card border border-border text-muted-foreground hover:text-foreground'}`}>
                {source === 'all' ? 'Tous' : source}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Showing {filtered.length} user{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* TABLE */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['ID', 'Nom', 'Role', 'Source', 'Type', 'Session', 'Domaine', 'Score IA', 'Statut', 'Actions'].map(h => (
                  <th key={h} className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={10} className="p-8 text-center text-muted-foreground">No users found.</td></tr>
              ) : filtered.map((guest, i) => {
                const analysis = analyzeGuest(guest);
                const aiGuest = MOCK_GUESTS.find(g => g.id === guest.id);
                const actionState = getOfferActionState(guest, aiGuest);
                const isGenerating = generatingIds.has(guest.id);
                const rowError = errorIds[guest.id];

                return (
                  <tr key={guest.id}
                    className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors animate-slide-up"
                    style={{ animationDelay: `${i * 50}ms` }}
                    onClick={() => navigate(`/guests/${guest.id}`)}>
                    <td className="p-4 font-mono text-xs text-muted-foreground">{guest.id}</td>
                    <td className="p-4 font-medium text-foreground">{guest.name}</td>
                    <td className="p-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${roleBadgeClasses[guest.role]}`}>
                        {guest.role}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium ${sourceBadgeClasses[guest.source]}`}>
                        {getSourceIcon(guest.source)}{guest.source}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{guest.type_client}</span>
                    </td>
                    <td className="p-4 font-mono text-xs">{guest.session_duration} min</td>
                    <td className="p-4 text-xs">{guest.domain}</td>
                    <td className="p-4">
                      <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${getScoreBgColor(analysis.level)}`}>
                        {analysis.score}
                      </span>
                    </td>
                    <td className="p-4">
                      {aiGuest ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getOfferStatusBadgeClasses(aiGuest.generatedOffer.status)}`}>
                          {getOfferStatusLabel(aiGuest.generatedOffer.status)}
                        </span>
                      ) : (
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${getGuestStatusBadgeClasses(guest.status)}`}>
                          {getGuestStatusLabel(guest.status)}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col gap-1">
                        {actionState === 'view' ? (
                          <button
                            onClick={e => { e.stopPropagation(); setStaticModal({ guest, analysis, aiGuest }); }}
                            className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-medium hover:bg-blue-50 transition-colors">
                            👁️ View Offre
                          </button>
                        ) : (
                          <button
                            onClick={e => handleGenerateOffer(e, guest, analysis, aiGuest)}
                            disabled={isGenerating}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors disabled:opacity-60 whitespace-nowrap">
                            {isGenerating
                              ? <><Loader2 className="h-3 w-3 animate-spin" />Génération...</>
                              : <><Sparkles className="h-3 w-3" />Generate Offer</>}
                          </button>
                        )}
                        {rowError && (
                          <p className="text-[10px] text-red-500 max-w-[140px] leading-tight">{rowError}</p>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* GUEST DETAIL PANEL */}
      {selectedGuest && (
        <div className="glass-card p-6 animate-slide-up">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-foreground">Détail — {selectedGuest.name}</h3>
            <button onClick={() => setSelectedGuest(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-2">
            {statusSteps.map((step, i) => {
              const stepIndex = statusSteps.indexOf(selectedGuest.status as typeof statusSteps[number]);
              const isComplete = i <= stepIndex;
              const isCurrent = i === stepIndex;
              return (
                <div key={step} className="flex items-center">
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-medium whitespace-nowrap ${isCurrent ? 'bg-primary text-primary-foreground' : isComplete ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>
                    {step}
                  </div>
                  {i < statusSteps.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground mx-1 shrink-0" />}
                </div>
              );
            })}
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[
                { name: 'Session (min)', value: selectedGuest.session_duration },
                { name: 'Interactions', value: selectedGuest.interaction_count },
                { name: 'Voice (min)', value: selectedGuest.voice_interaction_time },
                { name: 'Idle (min)', value: selectedGuest.idle_time },
              ]}>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(215 20% 65%)' }} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(0 0% 100%)', border: '1px solid hsl(195 22% 84%)', borderRadius: '8px', fontSize: '12px' }} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* MODALS */}
      {geminiModal && (
        <GeminiOfferModal
          guest={geminiModal.guest}
          aiGuest={geminiModal.aiGuest}
          offer={geminiModal.offer}
          onClose={() => setGeminiModal(null)}
        />
      )}
      {staticModal && (
        <StaticOfferModal
          guest={staticModal.guest}
          aiGuest={staticModal.aiGuest}
          analysis={staticModal.analysis}
          onClose={() => setStaticModal(null)}
        />
      )}
    </div>
  );
}