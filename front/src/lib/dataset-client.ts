import { useEffect, useState } from "react";
import type { BusinessMetric, ChurnProfile, Guest, Partner } from "@/lib/types";

export type AppData = {
  users: Guest[];
  guests: Guest[];
  partners: Partner[];
  businessMetrics: BusinessMetric[];
  churnProfiles: ChurnProfile[];
};

const API_BASE = "http://localhost:5000/api";

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const pick = (row: Record<string, unknown>, candidates: string[]): unknown => {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const target = normalizeKey(candidate);
    const exact = entries.find(([key]) => normalizeKey(key) === target);
    if (exact && exact[1] !== null && exact[1] !== "") return exact[1];
    const found = entries.find(([key]) => normalizeKey(key).includes(target));
    if (found && found[1] !== null && found[1] !== "") return found[1];
  }
  return null;
};

const toNum = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toSource = (value: unknown): Guest["source"] => {
  const raw = String(value ?? "").trim();
  if (raw === "LinkedIn" || raw === "Facebook" || raw === "Instagram" || raw === "Twitter" || raw === "YouTube") {
    return raw;
  }
  return "LinkedIn";
};

const toRole = (value: unknown): Guest["role"] => {
  const raw = String(value ?? "").trim();
  if (raw === "Guest" || raw === "Client" || raw === "Partner") {
    return raw;
  }
  return "Guest";
};

const toStatus = (value: unknown): Guest["status"] => {
  const raw = String(value ?? "").trim();
  if (raw === "Créé" || raw === "Lobby" || raw === "KPIs collectés" || raw === "Offre envoyée" || raw === "Converti") {
    return raw;
  }
  return "Créé";
};

const toRows = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null);
};

const mergeRoomKpis = (roomRows: Record<string, unknown>[]) => {
  const byUser = new Map<string, { obs: Record<string, number>; clicks: Record<string, number>; rooms: string[] }>();

  for (const row of roomRows) {
    const userId = pick(row, ["user_id"]);
    if (!userId) continue;

    const key = String(userId);
    const serviceId = String(pick(row, ["service_id"]) ?? "").toUpperCase();
    const roomName = serviceId.includes("TRAIN")
      ? "Training Center"
      : serviceId.includes("SHOW")
        ? "Showcase Room"
        : serviceId.includes("OPPORT")
          ? "Opportunity Room"
          : serviceId.includes("PITCH")
            ? "Pitch Room"
            : "Training Center";

    const totalTime = toNum(pick(row, ["temps_total", "total_time_in_room"]));
    const interactions = toNum(pick(row, ["nb_interactions", "total_interactions_in_room"]));

    const existing = byUser.get(key) ?? { obs: {}, clicks: {}, rooms: [] };
    existing.obs[roomName] = (existing.obs[roomName] ?? 0) + totalTime;
    existing.clicks[roomName] = (existing.clicks[roomName] ?? 0) + interactions;
    if (!existing.rooms.includes(roomName)) existing.rooms.push(roomName);
    byUser.set(key, existing);
  }

  return byUser;
};

const parseGuest = (
  userRow: Record<string, unknown>,
  kpiRow: Record<string, unknown> | null = null,
  roomData?: { obs: Record<string, number>; clicks: Record<string, number>; rooms: string[] }
): Guest | null => {
  const user_id = pick(userRow, ["user_id"]);
  if (!user_id) return null;

  const first_name = pick(userRow, ["first_name"]) ?? "Unknown";
  const last_name = pick(userRow, ["last_name"]) ?? "User";
  const domain = pick(userRow, ["domain"]) ?? "General";
  const role = pick(userRow, ["role"]);
  const room_observation_time = roomData?.obs ?? {};
  const room_click_rate = roomData?.clicks ?? {};
  const rooms_viewed = roomData?.rooms ?? [];

  const session_duration = toNum(pick(kpiRow || userRow, ["session_duration"]));
  const interaction_count = toNum(pick(kpiRow || userRow, ["interaction_count"]));
  const voice_interaction_time = toNum(pick(kpiRow || userRow, ["voice_interaction_time"]));
  const customization_time = toNum(pick(kpiRow || userRow, ["customization_time"]));
  const idle_time = toNum(pick(kpiRow || userRow, ["idle_time"]));
  const most_viewed_room = String(pick(kpiRow || userRow, ["most_viewed_room"]) ?? rooms_viewed[0] ?? "Training Center");

  return {
    id: String(user_id),
    name: `${String(first_name)} ${String(last_name)}`.trim(),
    source: toSource(pick(userRow, ["source"])),
    role: toRole(role),
    type_client: "Entreprise",
    domain: String(domain),
    session_duration,
    room_observation_time,
    room_click_rate,
    navigation_path: [],
    rooms_viewed,
    interaction_count,
    most_viewed_room,
    voice_interaction_time,
    customization_time,
    idle_time,
    status: toStatus(pick(userRow, ["status"])),
    created_at: String(pick(userRow, ["created_at"]) ?? new Date().toISOString()),
  };
};

const parsePartner = (row: Record<string, unknown>): Partner => {
  const partner_id = pick(row, ["service_id", "partner_id"]) ?? "unknown";
  const partner_name = pick(row, ["service", "service_name", "partner_name"]) ?? "Unknown";

  return {
    id: String(partner_id),
    name: String(partner_name),
    type_client: "Entreprise",
    level: "Partenaire",
    subscribed_rooms: ["Training Center"],
    engagement_score: 0,
    kpis: [],
    upsell_done: false,
    created_at: new Date().toISOString(),
  };
};

const mergeUserWithKpis = (
  usersRows: Record<string, unknown>[],
  kpisRows: Record<string, unknown>[],
  roomRows: Record<string, unknown>[]
): Guest[] => {
  const kpisMap = new Map<string, Record<string, unknown>>();
  const roomMap = mergeRoomKpis(roomRows);
  for (const kpi of kpisRows) {
    const kpi_user_id = pick(kpi, ["user_id"]);
    if (kpi_user_id) {
      kpisMap.set(String(kpi_user_id), kpi);
    }
  }

  return usersRows
    .map((userRow) => {
      const user_id = pick(userRow, ["user_id"]);
      if (!user_id) return null;
      const key = String(user_id);
      const kpi = kpisMap.get(key) ?? null;
      const roomData = roomMap.get(key);
      return parseGuest(userRow, kpi, roomData);
    })
    .filter((user): user is Guest => user !== null);
};

export const fetchAppData = async (): Promise<AppData> => {
  try {
    const response = await fetch(`${API_BASE}/datasets`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = response.json() as Promise<Record<string, unknown>>;
    const payload = await data;

    const usersRows = toRows(payload.users);
    const kpisRows = toRows(payload.guest_kpis);
    const roomRows = toRows(payload.room_kpi);
    const partnersRows = toRows(payload.service);

    const guests = mergeUserWithKpis(usersRows, kpisRows, roomRows);
    const partners = partnersRows.map(parsePartner);

    return {
      users: guests,
      guests,
      partners,
      businessMetrics: [],
      churnProfiles: [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch app data";
    console.error("fetchAppData error:", message);
    return {
      users: [],
      guests: [],
      partners: [],
      businessMetrics: [],
      churnProfiles: [],
    };
  }
};

export const useAppData = () => {
  const [data, setData] = useState<AppData>({
    users: [],
    guests: [],
    partners: [],
    businessMetrics: [],
    churnProfiles: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    fetchAppData()
      .then((payload) => {
        if (!mounted) return;
        setData(payload);
      })
      .catch((err) => {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : "Failed to load app data";
        setError(message);
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return { data, loading, error };
};
