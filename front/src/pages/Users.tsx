import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Loader2, Search, X, RefreshCw, FileDown, CheckCircle2 } from "lucide-react";
import { useAppData } from "@/lib/db-client";
import { getScoreBgColor } from "@/lib/scoring";
import { Guest, UserRole, UserSource } from "@/lib/types";

type ServicePackItem = {
  id: string;
  name: string;
  price: number;
  reason: string;
};

type PersonalizedPack = {
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
    pack_code: string;
    pack_name: string;
    nb_rooms: number;
    services: string[];
    reason: string;
  };
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

function PackModal({
  guest,
  pack,
  onClose,
  onRegenerate,
  regenerating,
}: {
  guest: Guest;
  pack: PersonalizedPack;
  onClose: () => void;
  onRegenerate: () => Promise<void>;
  regenerating: boolean;
}) {
  const [accepted, setAccepted] = useState(false);

  const handleDownloadPdf = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20">
                  <Sparkles className="h-3.5 w-3.5" /> Personalized Pack
                </span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-700 border border-emerald-200">
                  {pack.match_score} MATCH
                </span>
              </div>
              <h2 className="text-2xl font-black text-slate-900">{pack.name}</h2>
              <p className="text-sm text-slate-600 mt-1">{pack.description}</p>
              <p className="text-xs text-slate-500 mt-2">User: {guest.name} · Domain: {guest.domain}</p>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
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
                pack.kpis_addressed.map((kpi) => (
                  <span key={kpi} className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                    {kpi}
                  </span>
                ))
              ) : (
                <span className="text-sm text-slate-500">No KPI tags were returned.</span>
              )}
            </div>
          </div>

          <div className="border-y border-slate-200 py-4 flex items-center justify-between">
            <p className="text-sm uppercase tracking-wider font-bold text-slate-500">Total Price</p>
            <p className="text-2xl font-black text-slate-900">${pack.total_price}</p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase font-bold text-slate-500 tracking-wide mb-1">Summary</p>
            <p className="text-sm text-slate-700">{pack.summary}</p>
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <button
              onClick={onRegenerate}
              disabled={regenerating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60"
            >
              {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Regenerate
            </button>
            <button
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
            >
              <FileDown className="h-4 w-4" /> Download PDF
            </button>
            <button
              onClick={() => setAccepted(true)}
              disabled={accepted}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${
                accepted ? "bg-emerald-100 text-emerald-700" : "bg-emerald-600 text-white hover:bg-emerald-700"
              } disabled:opacity-70`}
            >
              <CheckCircle2 className="h-4 w-4" /> {accepted ? "Pack Accepted" : "Accept Pack"}
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
  const [activePack, setActivePack] = useState<{ guest: Guest; pack: PersonalizedPack } | null>(null);
  const [liveScores, setLiveScores] = useState<Record<string, number>>({});

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
                {["ID", "Name", "Role", "Source", "Type", "Session", "Domain", "AI Score", "Actions"].map((header) => (
                  <th key={header} className="text-left p-4 text-xs font-medium text-muted-foreground uppercase">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted-foreground">
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((guest, index) => {
                  const scoreValue = liveScores[guest.id] ?? 0;
                  const level = scoreValue > 70 ? "hot" : scoreValue >= 40 ? "warm" : "cold";
                  const isGenerating = generatingIds.has(guest.id);
                  const rowError = errorIds[guest.id];

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
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => void generatePackForGuest(guest)}
                            disabled={isGenerating}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-semibold hover:bg-primary/20 transition-colors disabled:opacity-60 whitespace-nowrap"
                          >
                            {isGenerating ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Generating your personalized pack...
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-3.5 w-3.5" />
                                Generate Offer
                              </>
                            )}
                          </button>
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
          onRegenerate={async () => {
            await generatePackForGuest(activePack.guest);
          }}
        />
      ) : null}
    </div>
  );
}
