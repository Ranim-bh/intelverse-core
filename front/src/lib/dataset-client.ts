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

const toRows = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null);
};

const parseGuest = (userRow: Record<string, unknown>, kpiRow: Record<string, unknown> | null = null): Guest | null => {
  const user_id = pick(userRow, ["user_id"]);
  if (!user_id) return null;

  const first_name = pick(userRow, ["first_name"]) ?? "Unknown";
  const last_name = pick(userRow, ["last_name"]) ?? "User";
  const domain = pick(userRow, ["domain"]) ?? "General";
  const role = pick(userRow, ["role"]) ?? "User";

  const session_duration = toNum(pick(kpiRow || userRow, ["session_duration"]));
  const interaction_count = toNum(pick(kpiRow || userRow, ["interaction_count"]));
  const voice_interaction_time = toNum(pick(kpiRow || userRow, ["voice_interaction_time"]));

  return {
    id: String(user_id),
    user_id: String(user_id),
    first_name: String(first_name),
    last_name: String(last_name),
    domain: String(domain),
    role: String(role),
    source: String(pick(userRow, ["source"]) ?? ""),
    created_at: String(pick(userRow, ["created_at"]) ?? new Date().toISOString()),
    email: `${first_name}.${last_name}@talentverse.local`.toLowerCase(),
    status: "active" as const,
    churn_risk: "low" as const,
    engagement_score: 0,
    ai_score: interaction_count > 0 ? Math.round(session_duration / 10) : 0,
    last_activity: new Date().toISOString(),
    session_duration,
    interaction_count,
    voice_interaction_time,
  };
};

const parsePartner = (row: Record<string, unknown>): Partner => {
  const partner_id = pick(row, ["service_id", "partner_id"]) ?? "unknown";
  const partner_name = pick(row, ["service", "service_name", "partner_name"]) ?? "Unknown";

  return {
    id: String(partner_id),
    name: String(partner_name),
    industry: "Technology",
    logo_url: "",
    description: "",
    contact_email: "",
    status: "active" as const,
    services_offered: [String(partner_name)],
  };
};

const mergeUserWithKpis = (
  usersRows: Record<string, unknown>[],
  kpisRows: Record<string, unknown>[]
): Guest[] => {
  const kpisMap = new Map<string, Record<string, unknown>>();
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
      const kpi = kpisMap.get(String(user_id)) ?? null;
      return parseGuest(userRow, kpi);
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
    const partnersRows = toRows(payload.service);

    const guests = mergeUserWithKpis(usersRows, kpisRows);
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
