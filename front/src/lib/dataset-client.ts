import { useEffect, useState } from "react";
import type { BusinessMetric, ChurnProfile, Guest, Partner, RoomName, UserRole, UserSource } from "@/lib/types";

type RawRow = Record<string, unknown>;
type RawDatasets = Record<string, unknown>;

export interface AppDatasets {
  users: Guest[];
  guests: Guest[];
  partners: Partner[];
  businessMetrics: BusinessMetric[];
  churnProfiles: ChurnProfile[];
  raw: RawDatasets;
}

const defaultDatasets: AppDatasets = {
  users: [],
  guests: [],
  partners: [],
  businessMetrics: [],
  churnProfiles: [],
  raw: {},
};

const safeArray = (value: unknown): RawRow[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is RawRow => typeof v === "object" && v !== null);
};

const n = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const pick = (row: RawRow, candidates: string[]): unknown => {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const target = n(candidate);
    const exact = entries.find(([key]) => n(key) === target);
    if (exact && exact[1] !== null && exact[1] !== "") return exact[1];

    const found = entries.find(([key]) => n(key).includes(target));
    if (found && found[1] !== null && found[1] !== "") return found[1];
  }
  return undefined;
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string") {
    if (value.includes(">")) {
      return value.split(">").map((v) => v.trim()).filter(Boolean);
    }
    return value.split(/[,;|]/).map((v) => v.trim()).filter(Boolean);
  }
  return [];
};

const isNumericLike = (value: unknown) => {
  const parsed = Number(String(value ?? "").trim());
  return Number.isFinite(parsed);
};

const parseRecordLike = (value: unknown): Record<string, number> => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[String(k)] = toNumber(v, 0);
    }
    return out;
  }

  if (typeof value === "string") {
    const out: Record<string, number> = {};
    const chunks = value.split(/[,;|]/);
    for (const chunk of chunks) {
      const [key, rawVal] = chunk.split(":");
      if (!key || !rawVal) continue;
      out[key.trim()] = toNumber(rawVal.trim(), 0);
    }
    return out;
  }

  return {};
};

const toRole = (value: unknown): UserRole => {
  const raw = String(value ?? "Guest").trim();
  const lower = raw.toLowerCase();
  if (lower === "client") return "Client";
  if (lower === "partner") return "Partner";
  if (lower === "guest") return "Guest";
  if (raw === "Client" || raw === "Partner" || raw === "Guest") return raw;
  return "Guest";
};

const toSource = (value: unknown): UserSource => {
  const val = String(value ?? "LinkedIn");
  if (["LinkedIn", "Facebook", "Instagram", "Twitter", "YouTube"].includes(val)) {
    return val as UserSource;
  }
  return "LinkedIn";
};

const resolveDomainFromRow = (row: RawRow): string => {
  const direct = pick(row, ["domain", "sector", "domaine", "industry"]);
  if (direct) return String(direct);

  const fromClientType = pick(row, ["type_client", "client_type", "type"]);
  if (fromClientType) return String(fromClientType);

  const fromShifted = pick(row, ["target_churn"]);
  if (fromShifted && String(fromShifted).trim() !== "0" && String(fromShifted).trim() !== "1") {
    return String(fromShifted);
  }

  return "Unknown";
};

const resolveNameFromRow = (row: RawRow, index: number): string => {
  const direct = pick(row, ["name", "company", "entreprise", "guest_name"]);
  if (direct) return String(direct).trim();

  const firstName = String(pick(row, ["first_name", "firstname", "firstName"]) ?? "").trim();
  const lastName = String(pick(row, ["last_name", "lastname", "lastName"]) ?? "").trim();
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;

  const email = String(pick(row, ["email"]) ?? "").trim();
  if (email && email.includes("@")) return email.split("@")[0] ?? email;

  return `Guest ${index + 1}`;
};

const scoreUserRichness = (user: Guest) => {
  let score = 0;
  if (!/^Guest\s+\d+$/i.test(user.name)) score += 3;
  if (user.domain !== "Unknown") score += 2;
  if (user.session_duration > 0) score += 2;
  if (user.interaction_count > 0) score += 2;
  if (Object.keys(user.room_click_rate).length > 0) score += 1;
  return score;
};

const mapGuest = (row: RawRow, index: number): Guest => {
  const name = resolveNameFromRow(row, index);
  const created = String(pick(row, ["created_at", "created_date", "date", "created", "calculated_at"]) ?? "2026-01-01");

  const mostViewedRoom = String(
    pick(row, ["most_viewed_room", "top_room", "room"]) ?? "Training Center"
  );

  const sessionDuration = toNumber(pick(row, ["session_duration", "duration", "session"]), 0);

  const roomsViewedRaw = pick(row, ["rooms_viewed", "rooms", "visited_rooms"]);
  const parsedRooms = toStringArray(roomsViewedRaw);
  const roomsViewedCount = isNumericLike(roomsViewedRaw) ? Math.max(1, toNumber(roomsViewedRaw, 1)) : parsedRooms.length;

  const navigationPathRaw = pick(row, ["navigation_path", "path", "navigation"]);
  let navigationPath = toStringArray(navigationPathRaw);
  if (!navigationPath.length && roomsViewedCount > 0) {
    navigationPath = ["Lobby", ...Array.from({ length: roomsViewedCount }, () => mostViewedRoom)];
  }

  const roomsViewed = parsedRooms.length
    ? parsedRooms
    : Array.from(new Set(Array.from({ length: roomsViewedCount }, () => mostViewedRoom)));

  const roomObservationRaw = pick(row, ["room_observation_time", "observation", "observation_rooms"]);
  let roomObservation = parseRecordLike(roomObservationRaw);
  if (!Object.keys(roomObservation).length && roomsViewed.length) {
    const perRoom = Math.max(1, Math.round(sessionDuration / Math.max(roomsViewed.length, 1)));
    roomObservation = roomsViewed.reduce<Record<string, number>>((acc, room) => {
      acc[room] = perRoom;
      return acc;
    }, {});
  }

  const roomClicksRaw = pick(row, ["room_click_rate", "click_rate", "room_clicks"]);
  let roomClicks = parseRecordLike(roomClicksRaw);
  if (!Object.keys(roomClicks).length && isNumericLike(roomClicksRaw)) {
    roomClicks = { [mostViewedRoom]: toNumber(roomClicksRaw, 0) };
  }

  return {
    id: String(pick(row, ["id", "guest_id", "user_id"]) ?? `G${String(index + 1).padStart(3, "0")}`),
    name,
    source: toSource(pick(row, ["source", "origin", "channel"])),
    role: toRole(pick(row, ["role", "profile_type", "user_role"])),
    type_client: String(pick(row, ["type_client", "client_type", "type", "organization_type"]) ?? "Entreprise") as Guest["type_client"],
    domain: resolveDomainFromRow(row),
    session_duration: sessionDuration,
    room_observation_time: roomObservation,
    room_click_rate: roomClicks,
    navigation_path: navigationPath,
    rooms_viewed: roomsViewed,
    interaction_count: toNumber(pick(row, ["interaction_count", "interactions", "clicks"]), 0),
    most_viewed_room: mostViewedRoom || roomsViewed[0] || "Training Center",
    voice_interaction_time: toNumber(pick(row, ["voice_interaction_time", "voice_time"]), 0),
    customization_time: toNumber(pick(row, ["customization_time", "custom_time"]), 0),
    idle_time: toNumber(pick(row, ["idle_time", "idle"]), 0),
    status: String(pick(row, ["status", "statut", "guest_status"]) ?? "Créé") as Guest["status"],
    created_at: created,
  };
};

const mapPartner = (row: RawRow, index: number): Partner => {
  const roomList = toStringArray(pick(row, ["subscribed_rooms", "rooms", "rooms_subscribed"])) as RoomName[];
  const kpiRoom = String(pick(row, ["room", "main_room"]) ?? roomList[0] ?? "Training Center") as RoomName;

  return {
    id: String(pick(row, ["id", "partner_id"]) ?? `P${String(index + 1).padStart(3, "0")}`),
    name: String(pick(row, ["name", "partner_name", "company"]) ?? `Partner ${index + 1}`),
    type_client: String(pick(row, ["type_client", "client_type", "type"]) ?? "Entreprise") as Partner["type_client"],
    level: String(pick(row, ["level", "partner_level"]) ?? "Partenaire") as Partner["level"],
    subscribed_rooms: roomList.length ? roomList : ["Training Center"],
    engagement_score: toNumber(pick(row, ["engagement_score", "engagement"]), 0),
    kpis: [
      {
        room: kpiRoom,
        sessions: toNumber(pick(row, ["sessions", "session_count"]), 0),
        participants: toNumber(pick(row, ["participants"]), 0),
        avg_time: toNumber(pick(row, ["avg_time", "average_time"]), 0),
        certifications: toNumber(pick(row, ["certifications"]), 0),
        projets_presentes: toNumber(pick(row, ["projets_presentes", "projects"]), 0),
        visites: toNumber(pick(row, ["visites", "visits"]), 0),
        interactions: toNumber(pick(row, ["interactions"]), 0),
        avg_rating: toNumber(pick(row, ["avg_rating", "rating"]), 0),
        invitations: toNumber(pick(row, ["invitations"]), 0),
        entretiens: toNumber(pick(row, ["entretiens", "interviews"]), 0),
        recrutements: toNumber(pick(row, ["recrutements", "hires"]), 0),
        pitchs: toNumber(pick(row, ["pitchs", "pitches"]), 0),
        entreprises: toNumber(pick(row, ["entreprises", "companies"]), 0),
        discussion_duration: toNumber(pick(row, ["discussion_duration", "discussion"]), 0),
      },
    ],
    upsell_done: Boolean(pick(row, ["upsell_done", "upsell"])),
    created_at: String(pick(row, ["created_at", "date", "created"]) ?? "2026-01-01"),
  };
};

const mapPartnerAsUser = (partner: Partner): Guest => {
  const primaryRoom = partner.subscribed_rooms[0] ?? "Training Center";
  const sessions = partner.kpis.reduce((sum, k) => sum + (k.sessions || 0), 0);
  const interactions = partner.kpis.reduce((sum, k) => sum + (k.interactions || 0), 0);
  const roomObservationTime: Record<string, number> = {};
  const roomClickRate: Record<string, number> = {};

  for (const kpi of partner.kpis) {
    roomObservationTime[kpi.room] = kpi.avg_time ?? kpi.discussion_duration ?? 0;
    roomClickRate[kpi.room] = kpi.interactions ?? kpi.visites ?? 0;
  }

  return {
    id: partner.id,
    name: partner.name,
    source: "LinkedIn",
    role: "Partner",
    type_client: partner.type_client,
    domain: partner.type_client,
    session_duration: sessions,
    room_observation_time: roomObservationTime,
    room_click_rate: roomClickRate,
    navigation_path: partner.subscribed_rooms,
    rooms_viewed: partner.subscribed_rooms,
    interaction_count: interactions,
    most_viewed_room: primaryRoom,
    voice_interaction_time: 0,
    customization_time: 0,
    idle_time: 0,
    status: "KPIs collectés",
    created_at: partner.created_at,
  };
};

const mapBusinessMetric = (row: RawRow, index: number): BusinessMetric => ({
  month: String(pick(row, ["month", "mois"]) ?? `M${index + 1}`),
  mrr: toNumber(pick(row, ["mrr", "revenue"]), 0),
  cac: toNumber(pick(row, ["cac"]), 0),
  ltv: toNumber(pick(row, ["ltv"]), 0),
  conversion_rate: toNumber(pick(row, ["conversion_rate", "conversion"]), 0),
  churn_rate: toNumber(pick(row, ["churn_rate", "churn"]), 0),
});

const mapChurnProfile = (row: RawRow, index: number): ChurnProfile => ({
  id: String(pick(row, ["id", "profile_id"]) ?? `C${String(index + 1).padStart(3, "0")}`),
  name: String(pick(row, ["name", "company"]) ?? `Profile ${index + 1}`),
  profile_type: String(pick(row, ["profile_type", "type"]) ?? "Guest") as ChurnProfile["profile_type"],
  signals: toStringArray(pick(row, ["signals", "signal_codes"])) as ChurnProfile["signals"],
  risk_level: String(pick(row, ["risk_level", "risk"]) ?? "low") as ChurnProfile["risk_level"],
  days_since_signal: toNumber(pick(row, ["days_since_signal", "days"]), 0),
  last_action: String(pick(row, ["last_action", "action"]) ?? "") || undefined,
  recovered: Boolean(pick(row, ["recovered", "is_recovered"])),
});

const pickRowsByKey = (datasets: RawDatasets, regex: RegExp): RawRow[] => {
  const rows: RawRow[] = [];
  for (const [key, value] of Object.entries(datasets)) {
    if (!regex.test(key)) continue;
    rows.push(...safeArray(value));
  }
  return rows;
};

const pickRowsByExactKey = (datasets: RawDatasets, key: string): RawRow[] => {
  const value = datasets[key];
  return safeArray(value);
};

const roomLabelFromServiceId = (serviceId: string): string => {
  const normalized = n(serviceId);
  if (normalized.includes("training")) return "Training Center";
  if (normalized.includes("showcase")) return "Showcase Room";
  if (normalized.includes("opportunity")) return "Opportunity Room";
  if (normalized.includes("pitch")) return "Pitch Room";
  return serviceId || "Training Center";
};

const mergeUserWithKpis = (
  userRow: RawRow,
  userIndex: number,
  kpisByUserId: Map<string, RawRow>,
  roomRowsByUserId: Map<string, RawRow[]>
): Guest | null => {
  const userId = String(pick(userRow, ["user_id"]) ?? "").trim();
  if (!userId) return null;

  const kpiRow = userId ? (kpisByUserId.get(userId) ?? {}) : {};
  const roomRows = userId ? (roomRowsByUserId.get(userId) ?? []) : [];

  const roomObservationTime: Record<string, number> = {};
  const roomClickRate: Record<string, number> = {};
  for (const row of roomRows) {
    const serviceId = String(pick(row, ["service_id"]) ?? "").trim();
    const room = roomLabelFromServiceId(serviceId);
    roomObservationTime[room] = toNumber(pick(row, ["temps_total", "observation_time"]), 0);
    roomClickRate[room] = toNumber(pick(row, ["nb_interactions", "nb_visites"]), 0);
  }

  const merged: RawRow = {
    ...kpiRow,
    ...userRow,
    id: userId,
    name: resolveNameFromRow(userRow, userIndex),
    room_observation_time: roomObservationTime,
    room_click_rate: roomClickRate,
    rooms_viewed: Object.keys(roomObservationTime),
    most_viewed_room: Object.entries(roomObservationTime).sort((a, b) => b[1] - a[1])[0]?.[0],
    session_duration: toNumber(pick(kpiRow, ["session_duration"]), 0),
    interaction_count: toNumber(pick(kpiRow, ["interaction_count"]), 0),
    voice_interaction_time: toNumber(pick(kpiRow, ["voice_interaction_time"]), 0),
    customization_time: toNumber(pick(kpiRow, ["customization_time"]), 0),
    idle_time: toNumber(pick(kpiRow, ["idle_time"]), 0),
    navigation_path: pick(kpiRow, ["navigation_path"]),
    source: pick(userRow, ["source"]),
    role: pick(userRow, ["role"]),
    type_client: pick(userRow, ["organization_type", "type_client"]),
    domain: pick(userRow, ["domain"]),
    created_at: pick(userRow, ["created_at"]),
  };

  return mapGuest(merged, userIndex);
};

export const fetchAppDatasets = async (): Promise<AppDatasets> => {
  const res = await fetch("/api/datasets");
  if (!res.ok) {
    throw new Error(`Data API error ${res.status}`);
  }

  const raw = (await res.json()) as RawDatasets;

  // Use only explicit SQL tables from backend payload.
  const usersRows = pickRowsByExactKey(raw, "users");
  const guestKpiRows = pickRowsByExactKey(raw, "guest_kpis");
  const roomKpiRows = pickRowsByExactKey(raw, "room_kpi");

  const kpisByUserId = new Map<string, RawRow>();
  for (const row of guestKpiRows) {
    const userId = String(pick(row, ["user_id"]) ?? "").trim();
    if (!userId) continue;
    kpisByUserId.set(userId, row);
  }

  const roomRowsByUserId = new Map<string, RawRow[]>();
  for (const row of roomKpiRows) {
    const userId = String(pick(row, ["user_id"]) ?? "").trim();
    if (!userId) continue;
    const list = roomRowsByUserId.get(userId) ?? [];
    list.push(row);
    roomRowsByUserId.set(userId, list);
  }

  const users = usersRows
    .map((row, index) => mergeUserWithKpis(row, index, kpisByUserId, roomRowsByUserId))
    .filter((user): user is Guest => user !== null);

  const guests = users.filter((user) => user.role === "Guest");
  const partners: Partner[] = [];
  const businessMetrics: BusinessMetric[] = [];
  const churnProfiles: ChurnProfile[] = [];

  return {
    users,
    guests,
    partners,
    businessMetrics,
    churnProfiles,
    raw,
  };
};

export const useAppDatasets = () => {
  const [data, setData] = useState<AppDatasets>(defaultDatasets);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        setLoading(true);
        const datasets = await fetchAppDatasets();
        if (mounted) {
          setData(datasets);
          setError(null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to fetch data";
        if (mounted) {
          setError(message);
          setData(defaultDatasets);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    run();

    return () => {
      mounted = false;
    };
  }, []);

  return { data, loading, error };
};

export type AppData = AppDatasets;
export const fetchAppData = fetchAppDatasets;
export const useAppData = useAppDatasets;
