import Groq from "groq-sdk";
import { queryDb } from "./db.js";

const WEIGHTS: Record<string, number> = {
  session_duration: 20,
  interaction_count: 15,
  room_click_rate: 15,
  voice_interaction_time: 10,
  customization_time: 10,
  idle_time_inverted: 10,
  room_time_top: 10,
  room_interactions_top: 5,
  room_sessions_top: 5,
};

export type ScoreTier = "Solo" | "Duo" | "Trio" | "All-Access";

export interface ScoreBreakdown {
  guest_score: number;
  room_score: number;
  top_room: string;
  top_room_by_interactions: string;
}

export interface GuestScoreResult {
  guest_id: string;
  engagement_score: number;
  tier: ScoreTier;
  score_breakdown: ScoreBreakdown;
}

export interface RecommendationResult {
  guest_id: string;
  engagement_score: number;
  tier: ScoreTier;
  score_breakdown: ScoreBreakdown;
  recommended_pack: {
    pack_code: string;
    pack_name: string;
    nb_rooms: number;
    services: string[];
    reason: string;
  };
}

const getGroqClient = (): Groq => {
  const apiKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY");
  }
  return new Groq({ apiKey });
};

const n = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const toNum = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp01 = (value: number): number =>
  Math.max(0, Math.min(1, value));

const normalize = (value: number, max: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0)
    return 0;
  return clamp01(value / max);
};

const quoteIdentifier = (name: string): string => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Unsupported identifier '${name}'`);
  }
  return `"${name.replace(/"/g, '""')}"`;
};

const resolveTier = (
  score: number
): { tier: ScoreTier; nb_rooms: number } => {
  if (score <= 39) return { tier: "Solo", nb_rooms: 1 };
  if (score <= 69) return { tier: "Duo", nb_rooms: 2 };
  if (score <= 89) return { tier: "Trio", nb_rooms: 3 };
  return { tier: "All-Access", nb_rooms: 4 };
};

const parseGroqJson = (raw: string): Record<string, unknown> => {
  const fenced = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(fenced.slice(start, end + 1));
    }
    throw new Error("Failed to parse Groq JSON");
  }
};

interface TableResolution {
  guestTable: string;
  servicesTable: string;
  servicesLabelColumn: string;
  usersTable: string | null;
  roomKpiTable: string;
  packTable: string;
  packServiceTable: string;
}

const resolveTables = async (): Promise<TableResolution> => {
  const result = await queryDb(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public'
      AND table_type='BASE TABLE'
  `);

  const names = new Set(
    (result.rows as Array<{ table_name: string }>)
      .map((r) => String(r.table_name).toLowerCase())
  );

  const guestTable = names.has("guest")
    ? "guest"
    : names.has("guest_kpis")
      ? "guest_kpis"
      : "";

  const servicesTable = names.has("services")
    ? "services"
    : names.has("service")
      ? "service"
      : "";

  const roomKpiTable = names.has("room_kpi") ? "room_kpi" : "";
  const packTable = names.has("pack") ? "pack" : "";
  const packServiceTable = names.has("pack_service") ? "pack_service" : "";
  const usersTable = names.has("users") ? "users" : null;

  if (!guestTable)
    throw new Error(
      "Missing guest table (expected guest or guest_kpis)"
    );
  if (!servicesTable)
    throw new Error(
      "Missing services table (expected services or service)"
    );
  if (!roomKpiTable)
    throw new Error("Missing room_kpi table");
  if (!packTable || !packServiceTable)
    throw new Error(
      "Missing pack catalog tables (pack, pack_service)"
    );

  const serviceColumnsResult = await queryDb(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
  `,
    [servicesTable]
  );

  const serviceColumns = new Set(
    (serviceColumnsResult.rows as Array<{ column_name: string }>)
      .map((r) => String(r.column_name).toLowerCase())
  );

  const servicesLabelColumn = serviceColumns.has("service")
    ? "service"
    : serviceColumns.has("service_name")
      ? "service_name"
      : serviceColumns.has("name")
        ? "name"
        : "service_id";

  return {
    guestTable,
    servicesTable,
    servicesLabelColumn,
    usersTable,
    roomKpiTable,
    packTable,
    packServiceTable,
  };
};

export const getGuestScore = async (
  guestId: string
): Promise<Omit<GuestScoreResult, "guest_id"> & { guest_id: string }> => {
  const tables = await resolveTables();
  
  // For now, generate a mock score value
  const mockScore = toNum(guestId.charCodeAt(0)) % 100;
  const { tier } = resolveTier(mockScore);

  return {
    guest_id: guestId,
    engagement_score: mockScore,
    tier,
    score_breakdown: {
      guest_score: mockScore,
      room_score: 50,
      top_room: "TRAINING_CENTER",
      top_room_by_interactions: "PITCH_ROOM",
    },
  };
};

export const recommendForGuest = async (
  guestId: string
): Promise<RecommendationResult> => {
  const score = await getGuestScore(guestId);

  return {
    guest_id: guestId,
    engagement_score: score.engagement_score,
    tier: score.tier,
    score_breakdown: score.score_breakdown,
    recommended_pack: {
      pack_code: `PACK_${score.tier.toUpperCase()}`,
      pack_name: `${score.tier} Pack`,
      nb_rooms: score.tier === "Solo" ? 1 :
                score.tier === "Duo" ? 2 :
                score.tier === "Trio" ? 3 : 4,
      services: ["TRAINING_CENTER", "OPPORTUNITY_ROOM"],
      reason: `Recommended based on engagement profile and tier: ${score.tier}`,
    },
  };
};
