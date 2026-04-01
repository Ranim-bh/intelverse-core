import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2, Search, X, RefreshCw, FileDown, CheckCircle2, Send, Pencil, Eye } from "lucide-react";
import { useAppData } from "@/lib/db-client";
import { getScoreBgColor } from "@/lib/scoring";
import { Guest, UserRole, UserSource } from "@/lib/types";
import { toast } from "sonner";

type ServicePackItem = {
  id: string;
  name: string;
  price: number;
  reason: string;
};

type PersonalizedPack = {
  guest_id?: string;
  tier?: string;
  score_breakdown?: {
    guest_score: number;
    room_score: number;
    top_room: string;
    top_room_by_interactions: string;
  };
  recommended_pack_raw?: RecommendApiResponse["recommended_pack"];
  name: string;
  description: string;
  services: ServicePackItem[];
  total_price: number;
  kpis_addressed: string[];
  match_score: string;
  summary: string;
};

type PersonalizedPackResponse = {
  pack?: PersonalizedPack;
  main_interest?: string;
  recommended_pack?: Array<{ service: string; reason: string }>;
  offer_message?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
};

type RecommendApiResponse = {
  guest_id: string;
  engagement_score: number;
  tier: string;
  score_breakdown: {
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

type OfferStatus = "en_attente" | "generée" | "acceptée" | "refusée" | "envoyée";

type StoredOfferRecord = {
  offer_id: string;
  user_id: string;
  pack_id: string | null;
  tier: string | null;
  score: number | null;
  offer_payload: RecommendApiResponse;
  status: OfferStatus | string;
  created_at: string;
  updated_at: string;
};

const normalizeOfferStatus = (value: unknown): OfferStatus | null => {
  const raw = String(value ?? "").trim().toLowerCase();
  switch (raw) {
    case "en_attente":
    case "pending":
      return "en_attente";
    case "generée":
    case "générée":
    case "generee":
    case "generated":
      return "generée";
    case "envoyée":
    case "envoyee":
    case "sent":
      return "envoyée";
    case "acceptée":
    case "acceptee":
    case "accepted":
      return "acceptée";
    case "refusée":
    case "refusee":
    case "rejected":
      return "refusée";
    default:
      return null;
  }
};

const normalizeServiceKey = (value: string) => value.trim().toUpperCase();

const serviceCatalog: Record<string, { id: string; name: string }> = {
  TRAINING_CENTER: { id: "TRAINING_CENTER", name: "TRAINING_CENTER" },
  OPPORTUNITY_ROOM: { id: "OPPORTUNITY_ROOM", name: "OPPORTUNITY_ROOM" },
  PITCH_ROOM: { id: "PITCH_ROOM", name: "PITCH_ROOM" },
  SHOWCASE_ROOM: { id: "SHOWCASE_ROOM", name: "SHOWCASE_ROOM" },
};

const priorityToMatchScore: Record<"LOW" | "MEDIUM" | "HIGH", string> = {
  LOW: "68%",
  MEDIUM: "80%",
  HIGH: "92%",
};

const roleBadgeClasses: Record<UserRole, string> = {
  Guest: "bg-slate-100 text-slate-700 border-slate-200",
  Client: "bg-blue-100 text-blue-700 border-blue-200",
  Partner: "bg-purple-100 text-purple-700 border-purple-200",
};

const sourceBadgeClasses: Record<UserSource, string> = {
  LinkedIn: "bg-blue-100 text-blue-700 border-blue-200",
  Facebook: "bg-indigo-100 text-indigo-700 border-indigo-200",
  Instagram: "bg-pink-100 text-pink-700 border-pink-200",
  Twitter: "bg-sky-100 text-sky-700 border-sky-200",
  YouTube: "bg-red-100 text-red-700 border-red-200",
};

const sourceFilters: Array<"all" | UserSource> = ["all", "LinkedIn", "Facebook", "Instagram", "Twitter", "YouTube"];

const statusLabel: Record<OfferStatus | "none", string> = {
  none: "En attente",
  en_attente: "En attente",
  generée: "Offre generee",
  acceptée: "Offre acceptee",
  refusée: "Offre refusee",
  envoyée: "Offre envoyee",
};

const statusClass: Record<OfferStatus | "none", string> = {
  none: "bg-slate-100 text-slate-600 border-slate-200",
  en_attente: "bg-slate-100 text-slate-600 border-slate-200",
  generée: "bg-amber-100 text-amber-700 border-amber-200",
  acceptée: "bg-emerald-100 text-emerald-700 border-emerald-200",
  refusée: "bg-red-100 text-red-700 border-red-200",
  envoyée: "bg-blue-100 text-blue-700 border-blue-200",
};

const normalizeError = (message: string) => {
  const lower = message.toLowerCase();
  if (lower.includes("please complete your profile first")) return "Please complete your profile first";
  if (lower.includes("no services match your profile yet")) return "No services match your profile yet";
  if (lower.includes("failed to parse ai response")) return "Failed to parse AI response";
  if (lower.includes("guest '") && lower.includes("not found")) return "User profile was not found";
  if (lower.includes("user profile was not found")) return "User profile was not found";
  return "Unable to generate a personalized pack right now";
};

const hasKpis = (guest: Guest) => {
  const values = [
    guest.interaction_count,
    guest.session_duration,
    guest.voice_interaction_time,
    guest.idle_time,
    Object.values(guest.room_click_rate).reduce((sum, val) => sum + Number(val || 0), 0),
  ];

  return values.some((value) => Number.isFinite(value) && value > 0);
};

async function callGeneratePack(userId: string, retryOnParseError = true): Promise<PersonalizedPack> {
  const res = await fetch(`/api/recommend/${encodeURIComponent(userId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  let payload: { error?: string } | PersonalizedPackResponse | null = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const errorMessage = typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : `AI API error ${res.status}`;

    if (retryOnParseError && errorMessage.toLowerCase().includes("failed to parse ai response")) {
      return callGeneratePack(userId, false);
    }

    throw new Error(errorMessage);
  }

  if (!payload || typeof payload !== "object") {
    if (retryOnParseError) {
      return callGeneratePack(userId, false);
    }
    throw new Error("Failed to parse AI response");
  }

  const response = payload as PersonalizedPackResponse & RecommendApiResponse;

  if (response.recommended_pack?.pack_code) {
    const services = Array.isArray(response.recommended_pack.services)
      ? response.recommended_pack.services.map((name, index) => ({
        id: String(index + 1),
        name,
        price: 0,
        reason: response.recommended_pack.reason,
      }))
      : [];

    return {
      guest_id: response.guest_id,
      tier: response.tier,
      score_breakdown: response.score_breakdown,
      recommended_pack_raw: response.recommended_pack,
      name: response.recommended_pack.pack_name,
      description: `Tier ${response.tier} · Pack code ${response.recommended_pack.pack_code}`,
      services,
      total_price: 0,
      kpis_addressed: [response.score_breakdown.top_room, response.score_breakdown.top_room_by_interactions].filter(Boolean),
      match_score: `${response.engagement_score}%`,
      summary: response.recommended_pack.reason,
    };
  }

  if (response.pack && Array.isArray(response.pack.services)) {
    return response.pack;
  }

  if (Array.isArray(response.recommended_pack)) {
    const services: ServicePackItem[] = response.recommended_pack
      .map((item) => {
        const key = normalizeServiceKey(String(item.service ?? ""));
        const selected = serviceCatalog[key];
        if (!selected) return null;
        return {
          id: selected.id,
          name: selected.name,
          price: 0,
          reason: String(item.reason ?? "").trim() || "Selected for profile fit.",
        };
      })
      .filter((item): item is ServicePackItem => item !== null)
      .slice(0, 3);

    if (!services.length) {
      if (retryOnParseError) {
        return callGeneratePack(userId, false);
      }
      throw new Error("No services match your profile yet");
    }

    const priority = (response.priority ?? "MEDIUM").toUpperCase();
    const score = priority === "HIGH" || priority === "LOW" || priority === "MEDIUM"
      ? priorityToMatchScore[priority]
      : priorityToMatchScore.MEDIUM;

    return {
      name: `Pack ${String(response.main_interest ?? "PERSONALIZED").toUpperCase()}`,
      description: String(response.offer_message ?? "Personalized services recommendation.").trim(),
      services,
      total_price: services.reduce((sum, item) => sum + Number(item.price), 0),
      kpis_addressed: [String(response.main_interest ?? "EXPLORATION")],
      match_score: score,
      summary: String(response.offer_message ?? "").trim() || "A concise personalized offer pack.",
    };
  }

  if (retryOnParseError) {
    return callGeneratePack(userId, false);
  }
  throw new Error("Failed to parse AI response");
}

async function saveAcceptedPack(guestId: string, pack: PersonalizedPack): Promise<void> {
  const payload = {
    guest_id: pack.guest_id ?? guestId,
    engagement_score: Number(String(pack.match_score ?? "0").replace("%", "")) || 0,
    tier: pack.tier ?? "Duo",
    score_breakdown: pack.score_breakdown ?? {
      guest_score: 0,
      room_score: 0,
      top_room: "UNKNOWN",
      top_room_by_interactions: "UNKNOWN",
    },
    recommended_pack: {
      pack_id: pack.recommended_pack_raw?.pack_id,
      pack_code: pack.recommended_pack_raw?.pack_code ?? "",
      pack_name: pack.recommended_pack_raw?.pack_name ?? pack.name,
      nb_rooms: pack.recommended_pack_raw?.nb_rooms ?? 0,
      services: pack.recommended_pack_raw?.services ?? pack.services.map((s) => s.name),
      reason: pack.recommended_pack_raw?.reason ?? pack.summary,
    },
  };

  const res = await fetch(`/api/recommend/${encodeURIComponent(guestId)}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let errorMessage = `Save API error ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body?.error) errorMessage = body.error;
    } catch {
      // keep fallback message
    }
    throw new Error(errorMessage);
  }
}

const recommendationToPack = (response: RecommendApiResponse): PersonalizedPack => {
  const services = Array.isArray(response.recommended_pack?.services)
    ? response.recommended_pack.services.map((name, index) => ({
      id: String(index + 1),
      name,
      price: 0,
      reason: response.recommended_pack.reason,
    }))
    : [];

  return {
    guest_id: response.guest_id,
    tier: response.tier,
    score_breakdown: response.score_breakdown,
    recommended_pack_raw: response.recommended_pack,
    name: response.recommended_pack.pack_name,
    description: `Tier ${response.tier} · Pack code ${response.recommended_pack.pack_code}`,
    services,
    total_price: 0,
    kpis_addressed: [response.score_breakdown.top_room, response.score_breakdown.top_room_by_interactions].filter(Boolean),
    match_score: `${response.engagement_score}%`,
    summary: response.recommended_pack.reason,
  };
};

async function updateOfferStatus(guestId: string, status: OfferStatus): Promise<void> {
  const res = await fetch(`/api/recommend/${encodeURIComponent(guestId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    let errorMessage = `Status API error ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body?.error) errorMessage = body.error;
    } catch {
      // Keep fallback message
    }
    throw new Error(errorMessage);
  }
}

function PackModal({
  guest,
  pack,
  onClose,
  onRegenerate,
  regenerating,
  onAccept,
  isEditMode = false,
}: {
  guest: Guest;
  pack: PersonalizedPack;
  onClose: () => void;
  onRegenerate: () => Promise<void>;
  regenerating: boolean;
  onAccept: () => Promise<void>;
  isEditMode?: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const handleDownloadPdf = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Offre Generee
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-900 text-white border border-slate-900">
                  Powered by Groq
                </span>
              </div>
              <h2 className="text-3xl font-black text-slate-900">{pack.name}</h2>
              <p className="text-sm text-slate-600 mt-1">{pack.description}</p>
              <p className="text-xs text-slate-500 mt-2">User: {guest.name} · Domain: {guest.domain}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wide mb-2">Sessions</h3>
            <p className="text-4xl font-bold text-slate-900">{pack.services.length}</p>
          </div>

          <div>
            <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wide mb-3">Services</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pack.services.map((service) => (
                <div key={`${service.id}-${service.name}`} className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                  <p className="font-bold text-slate-900 flex items-center gap-2">✅ {service.name}</p>
                  <p className="text-sm text-slate-700 mt-1">Price: ${service.price}</p>
                  <p className="text-xs text-slate-600 mt-2">"{service.reason}"</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wide mb-3">KPIs Improved</h3>
            <div className="flex flex-wrap gap-2">
              {pack.kpis_addressed.length ? (
                pack.kpis_addressed.filter((kpi, idx, arr) => arr.indexOf(kpi) === idx).map((kpi) => (
                  <span key={kpi} className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    {kpi}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">No KPI tags were returned.</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs uppercase font-bold text-red-500 tracking-wide mb-1">Reason of Choice</p>
            <p className="text-sm text-red-900 italic">"{pack.summary}"</p>
          </div>

          <div className="border-y border-slate-200 py-4 flex items-center justify-between">
            <p className="text-sm uppercase tracking-wider font-bold text-slate-500">Total Price</p>
            <p className="text-2xl font-black text-slate-900">${pack.total_price}</p>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            {!isEditMode && (
              <button
                onClick={onRegenerate}
                disabled={regenerating}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
              >
                {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Regenerate
              </button>
            )}
            <button
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
            >
              <FileDown className="h-4 w-4" /> Download PDF
            </button>
            <button
              onClick={async () => {
                try {
                  setAccepting(true);
                  await onAccept();
                  setAccepted(true);
                } finally {
                  setAccepting(false);
                }
              }}
              disabled={accepted || accepting}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${
                accepted ? "bg-emerald-100 text-emerald-700" : "bg-emerald-600 text-white hover:bg-emerald-700"
              } disabled:opacity-70`}
            >
              <CheckCircle2 className="h-4 w-4" /> {accepted ? "Saved" : accepting ? "Saving..." : "Save Pack"}
            </button>
          </div>
          {accepted ? (
            <p className="text-sm text-emerald-700 font-medium text-right">Pack successfully saved</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OfferViewModal({
  guest,
  pack,
  onClose,
  status = "en_attente",
}: {
  guest: Guest;
  pack: PersonalizedPack;
  onClose: () => void;
  status?: OfferStatus | "none";
}) {
  const handleDownloadPdf = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-3">
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${statusClass[status]}`}>
                  {statusLabel[status]}
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-900 text-white border border-slate-900">
                  Powered by Groq
                </span>
              </div>
              <h2 className="text-3xl font-black text-slate-900">{pack.name}</h2>
              <p className="text-sm text-slate-600 mt-1">{pack.description}</p>
              <p className="text-xs text-slate-500 mt-2">User: {guest.name} · Domain: {guest.domain}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          <div className="border-b border-slate-200 pb-4">
            <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wide mb-2">Sessions</h3>
            <p className="text-4xl font-bold text-slate-900">{pack.services.length}</p>
          </div>

          <div>
            <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wide mb-3">Services</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pack.services.map((service) => (
                <div key={`${service.id}-${service.name}`} className="rounded-xl border border-slate-200 p-4 bg-slate-50">
                  <p className="font-bold text-slate-900 flex items-center gap-2">✅ {service.name}</p>
                  <p className="text-sm text-slate-700 mt-1">Price: ${service.price}</p>
                  <p className="text-xs text-slate-600 mt-2">"{service.reason}"</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs uppercase font-bold text-slate-500 tracking-wide mb-3">KPIs Improved</h3>
            <div className="flex flex-wrap gap-2">
              {pack.kpis_addressed.length ? (
                pack.kpis_addressed.filter((kpi, idx, arr) => arr.indexOf(kpi) === idx).map((kpi) => (
                  <span key={kpi} className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    {kpi}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">No KPI tags were returned.</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs uppercase font-bold text-red-500 tracking-wide mb-1">Reason of Choice</p>
            <p className="text-sm text-red-900 italic">"{pack.summary}"</p>
          </div>

          <div className="border-y border-slate-200 py-4 flex items-center justify-between">
            <p className="text-sm uppercase tracking-wider font-bold text-slate-500">Total Price</p>
            <p className="text-2xl font-black text-slate-900">${pack.total_price}</p>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
            >
              <FileDown className="h-4 w-4" /> Download PDF
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
            >
              <X className="h-4 w-4" /> Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Users() {
  const { data, loading, error } = useAppData();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<"all" | UserSource>("all");

  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [errorIds, setErrorIds] = useState<Record<string, string>>({});
  const [activePack, setActivePack] = useState<{ guest: Guest; pack: PersonalizedPack; isEditMode?: boolean } | null>(null);
  const [viewingOffer, setViewingOffer] = useState<{ guest: Guest; pack: PersonalizedPack; status?: OfferStatus } | null>(null);
  const [liveScores, setLiveScores] = useState<Record<string, number>>({});
  const [savedOffers, setSavedOffers] = useState<Record<string, StoredOfferRecord>>({});
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());

  const loadSavedOffers = async () => {
    try {
      const res = await fetch("/api/recommend/offers");
      if (!res.ok) return;
      const rows = await res.json() as StoredOfferRecord[];
      const map: Record<string, StoredOfferRecord> = {};
      for (const row of rows) {
        const normalizedStatus = normalizeOfferStatus(row.status) ?? "en_attente";
        const normalizedRow: StoredOfferRecord = {
          ...row,
          status: normalizedStatus,
        };

        // Primary key from table
        map[row.user_id] = normalizedRow;

        // Fallback key used by UI rows when user_id differs from payload guest_id
        const payloadGuestId = String(normalizedRow.offer_payload?.guest_id ?? "").trim();
        if (payloadGuestId) {
          map[payloadGuestId] = normalizedRow;
        }
      }
      setSavedOffers(map);
    } catch {
      // Keep table usable even if offers endpoint is unavailable.
    }
  };

  const loadScoreForGuest = async (guestId: string) => {
    try {
      const res = await fetch(`/api/recommend/${encodeURIComponent(guestId)}/score`);
      if (!res.ok) return;
      const data = await res.json() as { engagement_score?: number };
      const score = Number(data.engagement_score ?? 0);
      if (Number.isFinite(score)) {
        setLiveScores((prev) => ({ ...prev, [guestId]: score }));
      }
    } catch {
      // Keep UI resilient if score endpoint is unavailable for a row.
    }
  };

  const filteredUsers = useMemo(() => {
    return data.users.filter((guest) => {
      const matchSearch =
        guest.name.toLowerCase().includes(search.toLowerCase()) ||
        guest.id.toLowerCase().includes(search.toLowerCase());
      const matchRole = filterRole === "all" || guest.role === filterRole;
      const matchSource = filterSource === "all" || guest.source === filterSource;
      return matchSearch && matchRole && matchSource;
    });
  }, [data.users, filterRole, filterSource, search]);

  const generatePackForGuest = async (guest: Guest) => {
    setGeneratingIds((prev) => new Set(prev).add(guest.id));
    setErrorIds((prev) => {
      const next = { ...prev };
      delete next[guest.id];
      return next;
    });

    try {
      if (!hasKpis(guest)) {
        throw new Error("Please complete your profile first");
      }

      const pack = await callGeneratePack(guest.id, true);
      if (!pack.services.length) {
        throw new Error("No services match your profile yet");
      }

      // Business rule: regenerating a refused offer immediately restores generated status.
      const currentStatus = normalizeOfferStatus(savedOffers[guest.id]?.status);
      if (currentStatus === "refusée") {
        await updateOfferStatus(guest.id, "generée");
        await loadSavedOffers();
      }

      setActivePack({ guest, pack });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to generate a personalized pack right now";
      setErrorIds((prev) => ({ ...prev, [guest.id]: normalizeError(message) }));
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(guest.id);
        return next;
      });
    }
  };

  const savePackForGuest = async (guestId: string, pack: PersonalizedPack) => {

    try {
      await saveAcceptedPack(guestId, pack);
      await loadSavedOffers();
      toast.success("SAVED PACK", {
        description: "Pack enregistre dans la base de donnees avec le statut Generee",
        duration: 3000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save pack";
      toast.error("SAVE FAILED", {
        description: message,
        duration: 4000,
      });
      throw err;
    }
  };
  const sendOfferForGuest = async (guestId: string) => {
    setSendingIds((prev) => new Set(prev).add(guestId));
    try {
      await updateOfferStatus(guestId, "envoyée");
      await loadSavedOffers();
      toast.success("OFFER SENT", {
        description: "Offer sent via mail successfully.",
        duration: 3000,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to send offer";
      toast.error("SEND FAILED", {
        description: message,
        duration: 4000,
      });
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(guestId);
        return next;
      });
    }
  };

  useEffect(() => {
    void loadSavedOffers();
  }, []);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading data...</div>;
  }

  if (error) {
    return <div className="text-sm text-destructive">Data error: {error}</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Users</h1>
        <p className="text-sm text-muted-foreground">Generate personalized service packs from KPI and domain data.</p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search a user..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase pt-2">Role:</span>
            {["all", "Guest", "Client", "Partner"].map((role) => (
              <button
                key={role}
                onClick={() => setFilterRole(role)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  filterRole === role
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {role === "all" ? "All Roles" : role}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs font-semibold text-muted-foreground uppercase pt-2">Source:</span>
            {sourceFilters.map((source) => (
              <button
                key={source}
                onClick={() => setFilterSource(source)}
                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  filterSource === source
                    ? "bg-primary text-primary-foreground"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {source === "all" ? "All" : source}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Showing {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""}
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["ID", "Name", "Role", "Source", "Type", "Session", "Domain", "AI Score", "Status", "Actions"].map((header) => (
                  <th key={header} className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((guest, index) => {
                  const scoreValue = liveScores[guest.id] ?? 0;
                  const level = scoreValue > 70 ? "hot" : scoreValue >= 40 ? "warm" : "cold";
                  const isGenerating = generatingIds.has(guest.id);
                  const isSending = sendingIds.has(guest.id);
                  const rowError = errorIds[guest.id];
                  const storedOffer = savedOffers[guest.id];
                  const offerStatus = storedOffer?.status ?? "none";
                  const canGenerate = offerStatus === "none" || offerStatus === "en_attente";
                  const canRegenerate = offerStatus === "refusée";
                  const canEdit = Boolean(storedOffer) && (offerStatus === "generée" || offerStatus === "refusée");
                  const canView = Boolean(storedOffer) && offerStatus !== "en_attente";
                  const canSend = Boolean(storedOffer) && (offerStatus === "generée" || offerStatus === "refusée");

                  if (!(guest.id in liveScores)) {
                    void loadScoreForGuest(guest.id);
                  }

                  return (
                    <tr
                      key={guest.id}
                      className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors animate-slide-up"
                      style={{ animationDelay: `${index * 40}ms` }}
                      onClick={() => navigate(`/guests/${guest.id}`)}
                    >
                      <td className="p-4 font-mono text-xs text-muted-foreground">{guest.id}</td>
                      <td className="p-4 font-medium text-foreground">{guest.name}</td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${roleBadgeClasses[guest.role]}`}>
                          {guest.role}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${sourceBadgeClasses[guest.source]}`}>
                          {guest.source}
                        </span>
                      </td>
                      <td className="p-4 text-xs">{guest.type_client}</td>
                      <td className="p-4 font-mono text-xs">{guest.session_duration} min</td>
                      <td className="p-4 text-xs">{guest.domain}</td>
                      <td className="p-4">
                        <span className={`font-mono font-bold text-sm px-2 py-0.5 rounded ${getScoreBgColor(level)}`}>
                          {scoreValue}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border font-medium ${statusClass[offerStatus]}`}>
                          {statusLabel[offerStatus]}
                        </span>
                      </td>
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => void generatePackForGuest(guest)}
                              disabled={isGenerating || (!canGenerate && !canRegenerate)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-semibold hover:bg-primary/20 transition-colors disabled:opacity-60 whitespace-nowrap"
                            >
                              {isGenerating ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  Generating...
                                </>
                              ) : (
                                <>
                                  <Sparkles className="h-3.5 w-3.5" />
                                  {canRegenerate ? "Regenerate Offer" : "Generate Offer"}
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => {
                                if (!storedOffer) return;
                                setActivePack({ guest, pack: recommendationToPack(storedOffer.offer_payload), isEditMode: true });
                              }}
                              disabled={!canEdit}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
                              title="Edit saved pack"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (!storedOffer) return;
                                setViewingOffer({ guest, pack: recommendationToPack(storedOffer.offer_payload), status: storedOffer.status });
                              }}
                              disabled={!canView}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
                              title="View saved offer"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => void sendOfferForGuest(guest.id)}
                              disabled={!canSend || isSending}
                              className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40"
                              title="Send offer"
                            >
                              {isSending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          {rowError ? <p className="text-[10px] text-red-500 max-w-[220px] leading-tight">{rowError}</p> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {activePack ? (
        <PackModal
          guest={activePack.guest}
          pack={activePack.pack}
          onClose={() => setActivePack(null)}
          regenerating={generatingIds.has(activePack.guest.id)}
          isEditMode={activePack.isEditMode || false}
          onRegenerate={async () => {
            await generatePackForGuest(activePack.guest);
          }}
          onAccept={async () => {
            await savePackForGuest(activePack.guest.id, activePack.pack);
          }}
        />
      ) : null}

      {viewingOffer ? (
        <OfferViewModal
          guest={viewingOffer.guest}
          pack={viewingOffer.pack}
          status={viewingOffer.status || "en_attente"}
          onClose={() => setViewingOffer(null)}
        />
      ) : null}
    </div>
  );
}
