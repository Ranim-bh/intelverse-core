import Groq from "groq-sdk";
import { queryDb } from "./db.js";

export type LeadScoringKpiKey =
  | "session_duration"
  | "rooms_visited"
  | "voice_time"
  | "interactions"
  | "idle_time"
  | "guest_score"
  | "room_score"
  | "engagement_score"
  | "score";

export interface LeadScoringWeightRow {
  kpi_key: LeadScoringKpiKey | string;
  label: string;
  category: string;
  weight: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface LeadScoringKpiOption {
  kpi_key: string;
  label: string;
  category: string;
}

const DEFAULT_LEAD_SCORING_ROWS: Array<Pick<LeadScoringWeightRow, "kpi_key" | "label" | "category" | "weight" | "is_default">> = [
  { kpi_key: "session_duration", label: "Durée session", category: "Engagement", weight: 35, is_default: true },
  { kpi_key: "rooms_visited", label: "Rooms visitées", category: "Engagement", weight: 25, is_default: true },
  { kpi_key: "voice_time", label: "Temps vocal", category: "Engagement", weight: 20, is_default: true },
  { kpi_key: "interactions", label: "Interactions", category: "Engagement", weight: 15, is_default: true },
  { kpi_key: "idle_time", label: "Idle time", category: "Engagement", weight: 5, is_default: true },
];

const KPI_LABELS: Record<string, { label: string; category: string }> = {
  session_duration: { label: "Durée session", category: "Engagement" },
  rooms_visited: { label: "Rooms visitées", category: "Engagement" },
  voice_time: { label: "Temps vocal", category: "Engagement" },
  interactions: { label: "Interactions", category: "Engagement" },
  idle_time: { label: "Idle time", category: "Engagement" },
  guest_score: { label: "Guest score", category: "Scoring" },
  room_score: { label: "Room score", category: "Scoring" },
  engagement_score: { label: "Engagement score", category: "Scoring" },
  score: { label: "Global score", category: "Scoring" },
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
    pack_id?: string;
    pack_code: string;
    pack_name: string;
    nb_rooms: number;
    services: string[];
    reason: string;
  };
}

export type OfferStatus = "en_attente" | "generée" | "envoyée" | "acceptée" | "refusée";

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
  servicesIdColumn: string;
  servicesLabelColumn: string;
  usersTable: string | null;
  roomKpiTable: string;
  packTable: string;
  packServiceTable: string;
}

interface GuestKpiRow {
  id: string;
  session_duration: number | null;
  interaction_count: number | null;
  room_click_rate: number | null;
  voice_interaction_time: number | null;
  customization_time: number | null;
  idle_time: number | null;
  most_viewed_room: string | null;
}

interface RoomKpiRow {
  service_id: string;
  room_name: string;
  total_time_in_room: number;
  total_interactions_in_room: number;
  total_participants_in_room: number;
  nb_sessions_in_room: number;
}

interface BoundsRow {
  max_sd: number | null;
  max_ic: number | null;
  max_rcr: number | null;
  max_vit: number | null;
  max_ct: number | null;
  max_it: number | null;
}

interface RoomBoundsRow {
  max_room_time: number | null;
  max_room_int: number | null;
  max_room_sess: number | null;
}

interface PackRow {
  pack_id: string;
  pack_name: string;
  pack_code: string;
  nb_rooms: number;
  description: string | null;
  service_ids: string;
  service_names: string;
}

interface UpsertOfferRow {
  offer_id: string;
  updated_at: string;
}

interface ScoreWeightsDbRow {
  metric_name: string;
  weight: string | number;
  updated_at: string;
}

interface StoredOfferDbRow {
  offer_id: string;
  user_id: string;
  pack_id: string | null;
  tier: string | null;
  score: string | number | null;
  offer_payload: unknown;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
}

export interface StoredOfferRecord {
  offer_id: string;
  user_id: string;
  pack_id: string | null;
  tier: string | null;
  score: number | null;
  offer_payload: RecommendationResult;
  status: OfferStatus;
  created_at: string;
  updated_at: string;
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

  const configuredServicesTable = String(process.env.SERVICES_TABLE_KEY ?? "")
    .trim()
    .toLowerCase();

  const servicesTable = configuredServicesTable && names.has(configuredServicesTable)
    ? configuredServicesTable
    : names.has("services")
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

  const servicesIdColumn = serviceColumns.has("service_id")
    ? "service_id"
    : serviceColumns.has("id")
      ? "id"
      : "service_id";

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
    servicesIdColumn,
    servicesLabelColumn,
    usersTable,
    roomKpiTable,
    packTable,
    packServiceTable,
  };
};

const parseCsvList = (value: string): string[] =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const RESERVED_METRIC_KEYS = new Set([
  "kpi_id",
  "id",
  "user_id",
  "guest_id",
  "service_id",
  "pack_id",
  "offer_id",
  "calculated_at",
  "created_at",
  "updated_at",
  "status",
]);

const isNumericColumn = (dataType: string, udtName: string): boolean => {
  const normalized = String(dataType ?? "").toLowerCase();
  const udt = String(udtName ?? "").toLowerCase();
  return (
    normalized === "smallint"
    || normalized === "integer"
    || normalized === "bigint"
    || normalized === "numeric"
    || normalized === "real"
    || normalized === "double precision"
    || udt === "int2"
    || udt === "int4"
    || udt === "int8"
    || udt === "float4"
    || udt === "float8"
    || udt === "numeric"
  );
};

const getNumericColumnsForTable = async (tableName: string): Promise<string[]> => {
  const columns = await queryDb<{
    column_name: string;
    data_type: string;
    udt_name: string;
  }>(
    `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position ASC
    `,
    [tableName]
  );

  return columns.rows
    .map((col) => ({
      key: String(col.column_name ?? "").trim(),
      isNumeric: isNumericColumn(col.data_type, col.udt_name),
    }))
    .filter((col) => col.key && col.isNumeric && !RESERVED_METRIC_KEYS.has(col.key))
    .map((col) => col.key);
};

const buildAliasMetricMap = (
  guestRaw: Record<string, number>,
  roomRaw: Record<string, number>,
  roomsVisitedRaw: number
): Record<string, number> => ({
  session_duration: toNum(guestRaw.session_duration),
  rooms_visited: toNum(roomsVisitedRaw),
  voice_time: toNum(guestRaw.voice_interaction_time),
  interactions: toNum(guestRaw.interaction_count),
  idle_time: toNum(guestRaw.idle_time),
  voice_interaction_time: toNum(guestRaw.voice_interaction_time),
  interaction_count: toNum(guestRaw.interaction_count),
  room_click_rate: toNum(guestRaw.room_click_rate),
  ...guestRaw,
  ...roomRaw,
});

const computeWeightedAverage = (
  metricValues: Record<string, number>,
  weightByKey: Record<string, number>,
  eligibleKeys: string[]
): number => {
  const scopedWeights = eligibleKeys
    .map((key) => ({ key, weight: Math.max(0, Number(weightByKey[key] ?? 0)) }))
    .filter((item) => item.weight > 0 && Number.isFinite(metricValues[item.key]));

  const totalWeight = scopedWeights.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return 0;

  const weighted = scopedWeights.reduce((sum, item) => {
    return sum + (metricValues[item.key] ?? 0) * (item.weight / totalWeight);
  }, 0);

  return Math.max(0, Math.min(100, weighted));
};

const fetchGuestKpis = async (
  guestId: string,
  tables: TableResolution
): Promise<GuestKpiRow> => {
  const guestTable = quoteIdentifier(tables.guestTable);

  const result = tables.guestTable === "guest_kpis"
    ? await queryDb<GuestKpiRow>(
        `
      SELECT
        user_id AS id,
        session_duration,
        interaction_count,
        room_click_rate::numeric AS room_click_rate,
        voice_interaction_time,
        customization_time,
        idle_time,
        NULL::text AS most_viewed_room
      FROM ${guestTable}
      WHERE user_id = $1
      ORDER BY calculated_at DESC NULLS LAST
      LIMIT 1
    `,
        [guestId]
      )
    : await queryDb<GuestKpiRow>(
        `
      SELECT
        id,
        session_duration,
        interaction_count,
        room_click_rate::numeric AS room_click_rate,
        voice_interaction_time,
        customization_time,
        idle_time,
        most_viewed_room
      FROM ${guestTable}
      WHERE id = $1
      LIMIT 1
    `,
        [guestId]
      );

  if (!result.rows[0]) {
    const err = new Error(`Guest '${guestId}' not found`);
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  return result.rows[0];
};

const fetchRoomKpis = async (
  guestId: string,
  tables: TableResolution
): Promise<RoomKpiRow[]> => {
  const roomKpiTable = quoteIdentifier(tables.roomKpiTable);
  const servicesTable = quoteIdentifier(tables.servicesTable);
  const servicesIdColumn = quoteIdentifier(tables.servicesIdColumn);
  const servicesLabelColumn = quoteIdentifier(tables.servicesLabelColumn);

  const result = await queryDb<RoomKpiRow>(
    `
    SELECT
      rk.service_id,
      s.${servicesLabelColumn} AS room_name,
      SUM(rk.temps_total)::numeric AS total_time_in_room,
      SUM(rk.nb_interactions)::numeric AS total_interactions_in_room,
      SUM(rk.nb_participants)::numeric AS total_participants_in_room,
      COUNT(rk.kpi_id)::numeric AS nb_sessions_in_room
    FROM ${roomKpiTable} rk
    JOIN ${servicesTable} s ON s.${servicesIdColumn}::text = rk.service_id::text
    WHERE rk.user_id = $1
    GROUP BY rk.service_id, s.${servicesLabelColumn}
    ORDER BY total_time_in_room DESC
  `,
    [guestId]
  );

  return result.rows.map((row) => ({
    ...row,
    total_time_in_room: toNum(row.total_time_in_room),
    total_interactions_in_room: toNum(row.total_interactions_in_room),
    total_participants_in_room: toNum(row.total_participants_in_room),
    nb_sessions_in_room: toNum(row.nb_sessions_in_room),
  }));
};

const fetchBounds = async (tables: TableResolution) => {
  const guestTable = quoteIdentifier(tables.guestTable);
  const roomKpiTable = quoteIdentifier(tables.roomKpiTable);

  const guestBounds = await queryDb<BoundsRow>(
    `
    SELECT
      MAX(session_duration)::numeric AS max_sd,
      MAX(interaction_count)::numeric AS max_ic,
      MAX(room_click_rate::numeric)::numeric AS max_rcr,
      MAX(voice_interaction_time)::numeric AS max_vit,
      MAX(customization_time)::numeric AS max_ct,
      MAX(idle_time)::numeric AS max_it
    FROM ${guestTable}
  `
  );

  const roomBounds = await queryDb<RoomBoundsRow>(
    `
    SELECT
      MAX(room_time)::numeric AS max_room_time,
      MAX(room_interactions)::numeric AS max_room_int,
      MAX(room_sessions)::numeric AS max_room_sess
    FROM (
      SELECT
        user_id,
        service_id,
        SUM(temps_total) AS room_time,
        SUM(nb_interactions) AS room_interactions,
        COUNT(kpi_id) AS room_sessions
      FROM ${roomKpiTable}
      GROUP BY user_id, service_id
    ) t
  `
  );

  return {
    guestBounds: guestBounds.rows[0] ?? {
      max_sd: 0,
      max_ic: 0,
      max_rcr: 0,
      max_vit: 0,
      max_ct: 0,
      max_it: 0,
    },
    roomBounds: roomBounds.rows[0] ?? {
      max_room_time: 0,
      max_room_int: 0,
      max_room_sess: 0,
    },
  };
};

const fetchPacksForTier = async (
  nbRooms: number,
  tables: TableResolution
): Promise<PackRow[]> => {
  const packTable = quoteIdentifier(tables.packTable);
  const packServiceTable = quoteIdentifier(tables.packServiceTable);
  const servicesTable = quoteIdentifier(tables.servicesTable);
  const servicesIdColumn = quoteIdentifier(tables.servicesIdColumn);
  const servicesLabelColumn = quoteIdentifier(tables.servicesLabelColumn);

  const packs = await queryDb<PackRow>(
    `
    SELECT
      p.pack_id,
      p.pack_name,
      p.pack_code,
      p.nb_rooms,
      p.description,
      string_agg(s.${servicesIdColumn}::text, ',' ORDER BY s.${servicesIdColumn}::text) AS service_ids,
      string_agg(s.${servicesLabelColumn}, ', ' ORDER BY s.${servicesLabelColumn}) AS service_names
    FROM ${packTable} p
    JOIN ${packServiceTable} ps ON ps.pack_id = p.pack_id
    JOIN ${servicesTable} s ON s.${servicesIdColumn}::text = ps.service_id::text
    WHERE p.nb_rooms = $1
    GROUP BY p.pack_id, p.pack_name, p.pack_code, p.nb_rooms, p.description
  `,
    [nbRooms]
  );

  if (packs.rows.length) {
    return packs.rows;
  }

  const available = await queryDb<PackRow>(
    `
    SELECT
      p.pack_id,
      p.pack_name,
      p.pack_code,
      p.nb_rooms,
      p.description,
      string_agg(s.${servicesIdColumn}::text, ',' ORDER BY s.${servicesIdColumn}::text) AS service_ids,
      string_agg(s.${servicesLabelColumn}, ', ' ORDER BY s.${servicesLabelColumn}) AS service_names
    FROM ${packTable} p
    JOIN ${packServiceTable} ps ON ps.pack_id = p.pack_id
    JOIN ${servicesTable} s ON s.${servicesIdColumn}::text = ps.service_id::text
    GROUP BY p.pack_id, p.pack_name, p.pack_code, p.nb_rooms, p.description
  `
  );

  if (!available.rows.length) {
    const err = new Error(`No pack found for tier size ${nbRooms}`);
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  const nearestNbRooms = [...new Set(available.rows.map((row) => toNum(row.nb_rooms)))]
    .filter((value) => value > 0)
    .sort((a, b) => {
      const delta = Math.abs(a - nbRooms) - Math.abs(b - nbRooms);
      return delta !== 0 ? delta : a - b;
    })[0];

  if (!nearestNbRooms || nearestNbRooms <= 0) {
    const err = new Error(`No pack found for tier size ${nbRooms}`);
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  const fallback = available.rows.filter((row) => toNum(row.nb_rooms) === nearestNbRooms);
  if (fallback.length) {
    return fallback;
  }

  const err = new Error(`No pack found for tier size ${nbRooms}`);
  (err as Error & { status?: number }).status = 404;
  throw err;
};

const fetchPackByCode = async (
  packCode: string,
  tables: TableResolution
): Promise<PackRow | undefined> => {
  const packTable = quoteIdentifier(tables.packTable);
  const packServiceTable = quoteIdentifier(tables.packServiceTable);
  const servicesTable = quoteIdentifier(tables.servicesTable);
  const servicesIdColumn = quoteIdentifier(tables.servicesIdColumn);
  const servicesLabelColumn = quoteIdentifier(tables.servicesLabelColumn);

  const selected = await queryDb<PackRow>(
    `
    SELECT
      p.pack_id,
      p.pack_name,
      p.pack_code,
      p.nb_rooms,
      p.description,
      string_agg(s.${servicesIdColumn}::text, ',' ORDER BY s.${servicesIdColumn}::text) AS service_ids,
      string_agg(s.${servicesLabelColumn}, ', ' ORDER BY s.${servicesLabelColumn}) AS service_names
    FROM ${packTable} p
    JOIN ${packServiceTable} ps ON ps.pack_id = p.pack_id
    JOIN ${servicesTable} s ON s.${servicesIdColumn}::text = ps.service_id::text
    WHERE LOWER(TRIM(p.pack_code)) = LOWER(TRIM($1))
    GROUP BY p.pack_id, p.pack_name, p.pack_code, p.nb_rooms, p.description
    LIMIT 1
  `,
    [packCode]
  );

  return selected.rows[0];
};

const pickDeterministicFallbackPack = (
  score: GuestScoreResult,
  packs: PackRow[]
): PackRow => {
  if (!packs.length) {
    throw new Error("No pack candidates available for fallback selection");
  }

  const topRoom = String(score.score_breakdown.top_room ?? "").trim().toLowerCase();
  if (topRoom) {
    const byTopRoom = packs.find((pack) =>
      parseCsvList(String(pack.service_names ?? "")).some((serviceName) =>
        String(serviceName).trim().toLowerCase() === topRoom
      )
    );
    if (byTopRoom) return byTopRoom;
  }

  const sorted = [...packs].sort((a, b) => {
    const left = String(a.pack_code ?? "").trim().toLowerCase();
    const right = String(b.pack_code ?? "").trim().toLowerCase();
    return left.localeCompare(right);
  });

  return sorted[0]!;
};

const ensureRecommendedOffersTable = async (): Promise<void> => {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS recommended_offers (
      offer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID UNIQUE NOT NULL,
      pack_id UUID NULL,
      tier TEXT,
      score NUMERIC,
      offer_payload JSONB NOT NULL,
      status TEXT CHECK (status IN ('en_attente', 'generée', 'envoyée', 'acceptée', 'refusée')) DEFAULT 'en_attente',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Bring legacy table schemas up to date (some environments have an older table shape).
  await queryDb(`
    ALTER TABLE recommended_offers
    ADD COLUMN IF NOT EXISTS pack_id UUID NULL
  `);

  await queryDb(`
    ALTER TABLE recommended_offers
    ADD COLUMN IF NOT EXISTS tier TEXT
  `);

  await queryDb(`
    ALTER TABLE recommended_offers
    ADD COLUMN IF NOT EXISTS score NUMERIC
  `);

  await queryDb(`
    ALTER TABLE recommended_offers
    ADD COLUMN IF NOT EXISTS offer_payload JSONB
  `);

  await queryDb(`
    ALTER TABLE recommended_offers
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'en_attente'
  `);

  await queryDb(`
    ALTER TABLE recommended_offers
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
  `);

  await queryDb(`
    ALTER TABLE recommended_offers
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()
  `);

  // Ensure required columns are populated for old rows before applying NOT NULL assumptions.
  await queryDb(`
    UPDATE recommended_offers
    SET offer_payload = '{}'::jsonb
    WHERE offer_payload IS NULL
  `);

  await queryDb(`
    ALTER TABLE recommended_offers
    ALTER COLUMN offer_payload SET NOT NULL
  `);

  // Align existing environments with the current French status constraint.
  await queryDb(`
    ALTER TABLE recommended_offers
    DROP CONSTRAINT IF EXISTS recommended_offers_status_check
  `);

  // Normalize legacy EN or unaccented values before re-applying the FR-only constraint.
  await queryDb(`
    UPDATE recommended_offers
    SET status = CASE LOWER(status)
      WHEN 'pending' THEN 'en_attente'
      WHEN 'en_attente' THEN 'en_attente'
      WHEN 'generated' THEN 'generée'
      WHEN 'generee' THEN 'generée'
      WHEN 'generée' THEN 'generée'
      WHEN 'générée' THEN 'generée'
      WHEN 'sent' THEN 'envoyée'
      WHEN 'envoyee' THEN 'envoyée'
      WHEN 'envoyée' THEN 'envoyée'
      WHEN 'accepted' THEN 'acceptée'
      WHEN 'acceptee' THEN 'acceptée'
      WHEN 'acceptée' THEN 'acceptée'
      WHEN 'rejected' THEN 'refusée'
      WHEN 'refusee' THEN 'refusée'
      WHEN 'refusée' THEN 'refusée'
      ELSE 'en_attente'
    END
  `);

  await queryDb(`
    ALTER TABLE recommended_offers
    ADD CONSTRAINT recommended_offers_status_check
    CHECK (status IN ('en_attente', 'generée', 'envoyée', 'acceptée', 'refusée'))
  `);
};

const ensureLeadScoringWeightsTable = async (): Promise<void> => {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS score_weights (
      id SERIAL PRIMARY KEY,
      metric_name VARCHAR(50) UNIQUE NOT NULL,
      weight NUMERIC NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const row of DEFAULT_LEAD_SCORING_ROWS) {
    await queryDb(
      `
      INSERT INTO score_weights (metric_name, weight, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (metric_name)
      DO NOTHING
      `,
      [row.kpi_key, row.weight]
    );
  }
};

const ensureUserScoresTable = async (): Promise<void> => {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS user_scores (
      user_id UUID PRIMARY KEY,
      score NUMERIC NOT NULL,
      engagement_level VARCHAR(10) NOT NULL,
      calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT user_scores_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(user_id)
    )
  `);
};

const normalizeLeadWeightRows = (rows: LeadScoringWeightRow[]): LeadScoringWeightRow[] => {
  const seen = new Set<string>();
  return rows
    .map((row) => {
      const kpiKey = String(row.kpi_key ?? "").trim();
      if (!kpiKey || seen.has(kpiKey)) return null;
      seen.add(kpiKey);
      const normalizedWeight = Number.isFinite(Number(row.weight))
        ? Math.max(0, Math.min(100, Number(row.weight)))
        : 0;
      const fallbackMeta = KPI_LABELS[kpiKey] ?? { label: kpiKey, category: "Custom" };
      return {
        ...row,
        kpi_key: kpiKey,
        label: String(row.label ?? "").trim() || fallbackMeta.label,
        category: String(row.category ?? "").trim() || fallbackMeta.category,
        weight: normalizedWeight,
      } as LeadScoringWeightRow;
    })
    .filter((row): row is LeadScoringWeightRow => row !== null);
};

export const getLeadScoringWeights = async (): Promise<LeadScoringWeightRow[]> => {
  await ensureLeadScoringWeightsTable();
  const result = await queryDb<ScoreWeightsDbRow>(`
    SELECT
      metric_name,
      weight::numeric,
      updated_at::text
    FROM score_weights
    ORDER BY metric_name ASC
  `);

  const mappedRows: LeadScoringWeightRow[] = result.rows.map((row) => {
    const key = String(row.metric_name ?? "").trim();
    const fallbackMeta = KPI_LABELS[key] ?? { label: key, category: "Custom" };
    return {
      kpi_key: key,
      label: fallbackMeta.label,
      category: fallbackMeta.category,
      weight: Number(row.weight ?? 0),
      is_default: false,
      created_at: String(row.updated_at ?? ""),
      updated_at: String(row.updated_at ?? ""),
    };
  });

  return normalizeLeadWeightRows(mappedRows);
};

export const saveLeadScoringWeights = async (
  rows: Array<Pick<LeadScoringWeightRow, "kpi_key" | "label" | "category" | "weight" | "is_default">>
): Promise<LeadScoringWeightRow[]> => {
  await ensureLeadScoringWeightsTable();
  const normalizedRows = normalizeLeadWeightRows(
    rows.map((row) => ({
      ...row,
      created_at: "",
      updated_at: "",
    }))
  );

  const total = normalizedRows.reduce((sum, row) => sum + Number(row.weight || 0), 0);
  if (normalizedRows.length < 3) {
    const err = new Error("At least 3 criteria are required");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  if (total > 100) {
    const err = new Error("Total weight cannot exceed 100");
    (err as Error & { status?: number }).status = 400;
    throw err;
  }

  await queryDb("BEGIN");
  try {
    // Replace full set to avoid UPDATE statements that can fire external DB triggers.
    await queryDb("DELETE FROM score_weights");

    for (const row of normalizedRows) {
      await queryDb(
        `
        INSERT INTO score_weights (metric_name, weight, updated_at)
        VALUES ($1, $2, NOW())
        `,
        [row.kpi_key, row.weight]
      );
    }
    await queryDb("COMMIT");
  } catch (error) {
    await queryDb("ROLLBACK");
    throw error;
  }

  return getLeadScoringWeights();
};

export const getAvailableRecommendedOfferKpis = async (): Promise<LeadScoringKpiOption[]> => {
  const existingTables = await queryDb<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('guest_kpis', 'room_kpi')
  `);

  const tables = existingTables.rows.map((row) => row.table_name).filter(Boolean);
  if (!tables.length) {
    return [];
  }

  const columns = await queryDb<{
    table_name: string;
    column_name: string;
    data_type: string;
    udt_name: string;
  }>(
    `
      SELECT table_name, column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name ASC, column_name ASC
    `,
    [tables]
  );

  const reserved = new Set([
    "kpi_id",
    "id",
    "user_id",
    "guest_id",
    "service_id",
    "pack_id",
    "offer_id",
    "calculated_at",
    "created_at",
    "updated_at",
    "status",
  ]);

  const isNumeric = (dataType: string, udtName: string): boolean => {
    const normalized = String(dataType ?? "").toLowerCase();
    const udt = String(udtName ?? "").toLowerCase();
    return (
      normalized === "smallint"
      || normalized === "integer"
      || normalized === "bigint"
      || normalized === "numeric"
      || normalized === "real"
      || normalized === "double precision"
      || udt === "int2"
      || udt === "int4"
      || udt === "int8"
      || udt === "float4"
      || udt === "float8"
      || udt === "numeric"
    );
  };

  const humanize = (key: string): string =>
    key
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const unique = new Map<string, LeadScoringKpiOption>();

  for (const col of columns.rows) {
    const key = String(col.column_name ?? "").trim();
    if (!key || reserved.has(key)) continue;
    if (!isNumeric(col.data_type, col.udt_name)) continue;
    if (unique.has(key)) continue;

    const meta = KPI_LABELS[key];
    const category = col.table_name === "room_kpi" ? "Room KPI" : "Guest KPI";

    unique.set(key, {
      kpi_key: key,
      label: meta?.label ?? humanize(key),
      category: meta?.category ?? category,
    });
  }

  return Array.from(unique.values()).sort((a, b) => a.label.localeCompare(b.label));
};

const upsertRecommendedOffer = async (args: {
  userId: string;
  packId: string | null;
  tier: ScoreTier;
  score: number;
  payload: RecommendationResult;
}): Promise<UpsertOfferRow> => {
  await ensureRecommendedOffersTable();

  const query = `
    INSERT INTO recommended_offers
      (user_id, pack_id, tier, score, offer_payload, status, updated_at)
    VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, 'generée', NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      pack_id       = EXCLUDED.pack_id,
      tier          = EXCLUDED.tier,
      score         = EXCLUDED.score,
      offer_payload = EXCLUDED.offer_payload,
      status        = 'generée',
      updated_at    = NOW()
    RETURNING offer_id, updated_at
  `;

  const result = await queryDb<UpsertOfferRow>(query, [
    args.userId,
    args.packId,
    args.tier,
    args.score,
    JSON.stringify(args.payload),
  ]);

  const row = result.rows[0];
  if (!row) {
    throw new Error("Failed to persist recommended offer");
  }
  return row;
};

const computeScore = async (guestId: string): Promise<GuestScoreResult> => {
  const tables = await resolveTables();
  const guest = await fetchGuestKpis(guestId, tables);
  const roomRows = await fetchRoomKpis(guestId, tables);
  const weights = await getLeadScoringWeights();
  const weightByKey = Object.fromEntries(weights.map((row) => [String(row.kpi_key), Number(row.weight || 0)]));

  const selectedKeys = Array.from(new Set(weights.map((row) => String(row.kpi_key)).filter(Boolean)));
  const metaKeys = new Set(["guest_score", "room_score", "engagement_score", "score"]);
  const primitiveKeys = selectedKeys.filter((key) => !metaKeys.has(key));

  const guestNumericColumns = await getNumericColumnsForTable(tables.guestTable);
  const roomNumericColumns = await getNumericColumnsForTable(tables.roomKpiTable);

  const selectedGuestColumns = primitiveKeys.filter((key) => guestNumericColumns.includes(key));
  const selectedRoomColumns = primitiveKeys.filter((key) => roomNumericColumns.includes(key));

  const guestTable = quoteIdentifier(tables.guestTable);
  const guestIdColumn = tables.guestTable === "guest_kpis" ? "user_id" : "id";

  const guestSelectColumns = selectedGuestColumns.length
    ? selectedGuestColumns.map((col) => `${quoteIdentifier(col)}::numeric AS ${quoteIdentifier(col)}`).join(",\n        ")
    : "1::numeric AS __placeholder";

  const guestRawResult = await queryDb<Record<string, unknown>>(
    `
      SELECT
        ${guestSelectColumns}
      FROM ${guestTable}
      WHERE ${quoteIdentifier(guestIdColumn)} = $1
      LIMIT 1
    `,
    [guestId]
  );

  const guestRawRow = guestRawResult.rows[0] ?? {};
  const guestRaw: Record<string, number> = {};
  for (const key of selectedGuestColumns) {
    guestRaw[key] = toNum((guestRawRow as Record<string, unknown>)[key]);
  }

  const guestMaxRaw: Record<string, number> = {};
  if (selectedGuestColumns.length) {
    const guestMaxSelect = selectedGuestColumns
      .map((col) => `MAX(${quoteIdentifier(col)})::numeric AS ${quoteIdentifier(col)}`)
      .join(",\n        ");

    const guestMaxResult = await queryDb<Record<string, unknown>>(
      `
        SELECT
          ${guestMaxSelect}
        FROM ${guestTable}
      `
    );

    const maxRow = guestMaxResult.rows[0] ?? {};
    for (const key of selectedGuestColumns) {
      guestMaxRaw[key] = toNum((maxRow as Record<string, unknown>)[key]);
    }
  }

  const roomRaw: Record<string, number> = {};
  const roomMaxRaw: Record<string, number> = {};
  const roomKpiTable = quoteIdentifier(tables.roomKpiTable);

  if (selectedRoomColumns.length) {
    const roomSumSelect = selectedRoomColumns
      .map((col) => `SUM(${quoteIdentifier(col)})::numeric AS ${quoteIdentifier(col)}`)
      .join(",\n        ");

    const roomRawResult = await queryDb<Record<string, unknown>>(
      `
        SELECT
          ${roomSumSelect}
        FROM ${roomKpiTable}
        WHERE user_id = $1
      `,
      [guestId]
    );

    const roomRow = roomRawResult.rows[0] ?? {};
    for (const key of selectedRoomColumns) {
      roomRaw[key] = toNum((roomRow as Record<string, unknown>)[key]);
    }

    const roomMaxInnerSelect = selectedRoomColumns
      .map((col) => `SUM(${quoteIdentifier(col)})::numeric AS ${quoteIdentifier(col)}`)
      .join(",\n            ");
    const roomMaxOuterSelect = selectedRoomColumns
      .map((col) => `MAX(${quoteIdentifier(col)})::numeric AS ${quoteIdentifier(col)}`)
      .join(",\n          ");

    const roomMaxResult = await queryDb<Record<string, unknown>>(
      `
        SELECT
          ${roomMaxOuterSelect}
        FROM (
          SELECT
            user_id,
            ${roomMaxInnerSelect}
          FROM ${roomKpiTable}
          GROUP BY user_id
        ) t
      `
    );

    const roomMaxRow = roomMaxResult.rows[0] ?? {};
    for (const key of selectedRoomColumns) {
      roomMaxRaw[key] = toNum((roomMaxRow as Record<string, unknown>)[key]);
    }
  }

  const roomsVisitedRawResult = await queryDb<{ rooms_visited: number }>(
    `
      SELECT COUNT(DISTINCT service_id)::int AS rooms_visited
      FROM ${roomKpiTable}
      WHERE user_id = $1
    `,
    [guestId]
  );
  const roomsVisitedRaw = toNum(roomsVisitedRawResult.rows[0]?.rooms_visited ?? 0);

  const roomsVisitedMaxResult = await queryDb<{ max_rooms_visited: number }>(
    `
      SELECT COALESCE(MAX(cnt), 0)::int AS max_rooms_visited
      FROM (
        SELECT user_id, COUNT(DISTINCT service_id) AS cnt
        FROM ${roomKpiTable}
        GROUP BY user_id
      ) t
    `
  );
  const roomsVisitedMax = toNum(roomsVisitedMaxResult.rows[0]?.max_rooms_visited ?? 0);

  const topByTime = roomRows[0];
  const topByInteractions = [...roomRows].sort(
    (a, b) => b.total_interactions_in_room - a.total_interactions_in_room
  )[0];

  const rawMetricValues = buildAliasMetricMap(guestRaw, roomRaw, roomsVisitedRaw);
  const rawMetricMaxValues = buildAliasMetricMap(guestMaxRaw, roomMaxRaw, roomsVisitedMax);

  const primitiveMetricMap: Record<string, number> = {};
  for (const key of primitiveKeys) {
    const raw = toNum(rawMetricValues[key]);
    const max = toNum(rawMetricMaxValues[key]);
    const normalized = key === "idle_time"
      ? clamp01(1 - normalize(raw, max)) * 100
      : normalize(raw, max) * 100;
    primitiveMetricMap[key] = Math.max(0, Math.min(100, normalized));
  }

  const guestMetricKeys = primitiveKeys.filter((key) => selectedGuestColumns.includes(key)
    || key === "session_duration"
    || key === "voice_time"
    || key === "interactions"
    || key === "idle_time"
    || key === "interaction_count"
    || key === "voice_interaction_time"
    || key === "room_click_rate");

  const roomMetricKeys = primitiveKeys.filter((key) => selectedRoomColumns.includes(key) || key === "rooms_visited");

  const guestScoreBase = computeWeightedAverage(primitiveMetricMap, weightByKey, guestMetricKeys);
  const roomScoreBase = computeWeightedAverage(primitiveMetricMap, weightByKey, roomMetricKeys);
  const engagementComposite = Math.max(0, Math.min(100, (guestScoreBase + roomScoreBase) / 2));

  const metricMap: Record<string, number> = {
    ...primitiveMetricMap,
    guest_score: guestScoreBase,
    room_score: roomScoreBase,
    engagement_score: engagementComposite,
    score: engagementComposite,
  };

  const totalWeight = weights.reduce((sum, row) => sum + Number(row.weight || 0), 0);
  const safeTotalWeight = totalWeight > 0 ? totalWeight : 100;
  const weightedScore = weights.reduce((sum, row) => {
    const key = String(row.kpi_key);
    const metricValue = toNum(metricMap[key]);
    return sum + metricValue * (Number(row.weight || 0) / safeTotalWeight);
  }, 0);

  const guestScore = Math.round(guestScoreBase);
  const roomScore = Math.round(roomScoreBase);

  const topRoom = topByTime?.room_name || String(guest.most_viewed_room ?? "UNKNOWN");
  const topRoomByInteractions = topByInteractions?.room_name || topRoom;
  const engagementScore = Math.round(Math.max(0, Math.min(100, weightedScore)));

  await ensureUserScoresTable();
  const engagementLevel = engagementScore > 70 ? "hot" : (engagementScore >= 40 ? "warm" : "cold");
  await queryDb(
    `
      INSERT INTO user_scores (user_id, score, engagement_level, calculated_at)
      VALUES ($1::uuid, $2, $3, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        score = EXCLUDED.score,
        engagement_level = EXCLUDED.engagement_level,
        calculated_at = NOW()
    `,
    [guestId, engagementScore, engagementLevel]
  );

  const { tier } = resolveTier(engagementScore);

  return {
    guest_id: guestId,
    engagement_score: engagementScore,
    tier,
    score_breakdown: {
      guest_score: Math.round(guestScore),
      room_score: Math.round(roomScore),
      top_room: topRoom,
      top_room_by_interactions: topRoomByInteractions,
    },
  };
};

const callGroqRecommendation = async (
  score: GuestScoreResult,
  packs: PackRow[]
): Promise<{ recommended_pack_code: string; reason: string }> => {
  const groq = getGroqClient();

  const messages = [
    {
      role: "system" as const,
      content:
        "You are a recommendation engine. Select ONE pack from the provided list only. Return strict JSON with keys: recommended_pack_code, reason.",
    },
    {
      role: "user" as const,
      content: `Guest score context:\n${JSON.stringify(score, null, 2)}\n\nAvailable packs:\n${JSON.stringify(packs, null, 2)}\n\nReturn only JSON.`,
    },
  ];

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 400,
  });

  const raw = String(response.choices?.[0]?.message?.content ?? "");
  const parsed = parseGroqJson(raw) as {
    recommended_pack_code?: string;
    reason?: string;
  };

  const code = String(parsed.recommended_pack_code ?? "").trim();
  if (!code) {
    const err = new Error("Groq returned empty recommended_pack_code");
    (err as Error & { status?: number }).status = 503;
    throw err;
  }

  return {
    recommended_pack_code: code,
    reason: String(parsed.reason ?? "").trim() || "Recommended by AI from engagement signals.",
  };
};

export const getGuestScore = async (
  guestId: string
): Promise<Omit<GuestScoreResult, "guest_id"> & { guest_id: string }> => {
  return computeScore(guestId);
};

export const recommendForGuest = async (
  guestId: string
): Promise<RecommendationResult> => {
  const score = await computeScore(guestId);
  const tables = await resolveTables();
  const { nb_rooms } = resolveTier(score.engagement_score);
  const packs = await fetchPacksForTier(nb_rooms, tables);
  let selected: PackRow | undefined;
  let reason = "Recommended from engagement signals.";

  try {
    const ai = await callGroqRecommendation(score, packs);
    selected = await fetchPackByCode(ai.recommended_pack_code, tables);

    if (!selected) {
      selected = packs.find(
        (pack) => n(pack.pack_code) === n(ai.recommended_pack_code)
      );
    }

    if (selected) {
      reason = ai.reason;
    }
  } catch {
    selected = undefined;
  }

  if (!selected) {
    selected = pickDeterministicFallbackPack(score, packs);
    reason = "Recommended using fallback scoring while AI is temporarily unavailable.";
  }

  const recommendation: RecommendationResult = {
    guest_id: guestId,
    engagement_score: score.engagement_score,
    tier: score.tier,
    score_breakdown: score.score_breakdown,
    recommended_pack: {
      pack_id: selected.pack_id,
      pack_code: selected.pack_code,
      pack_name: selected.pack_name,
      nb_rooms: selected.nb_rooms,
      services: parseCsvList(selected.service_names),
      reason,
    },
  };

  return recommendation;
};

export const saveRecommendationForGuest = async (
  guestId: string,
  recommendation: RecommendationResult
): Promise<{ offer_id: string; updated_at: string }> => {
  const canonicalRecommendation = await recommendForGuest(guestId);
  const normalizedRecommendation: RecommendationResult = canonicalRecommendation;

  const packId = normalizedRecommendation.recommended_pack.pack_id ?? null;
  const row = await upsertRecommendedOffer({
    userId: guestId,
    packId,
    tier: normalizedRecommendation.tier,
    score: normalizedRecommendation.engagement_score,
    payload: normalizedRecommendation,
  });

  return {
    offer_id: row.offer_id,
    updated_at: row.updated_at,
  };
};

export const listRecommendedOffers = async (): Promise<StoredOfferRecord[]> => {
  await ensureRecommendedOffersTable();

  const result = await queryDb<StoredOfferDbRow>(`
    SELECT
      offer_id::text,
      user_id::text,
      pack_id::text,
      tier,
      score,
      offer_payload,
      status,
      created_at::text,
      updated_at::text
    FROM recommended_offers
    ORDER BY updated_at DESC
  `);

  return result.rows
    .map((row) => {
      if (!row.offer_payload || typeof row.offer_payload !== "object") return null;
      return {
        offer_id: row.offer_id,
        user_id: row.user_id,
        pack_id: row.pack_id,
        tier: row.tier,
        score: row.score === null ? null : toNum(row.score),
        offer_payload: row.offer_payload as RecommendationResult,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
      } satisfies StoredOfferRecord;
    })
    .filter((row): row is StoredOfferRecord => row !== null);
};

export const updateRecommendedOfferStatus = async (
  guestId: string,
  status: OfferStatus
): Promise<{ offer_id: string; status: OfferStatus; updated_at: string }> => {
  await ensureRecommendedOffersTable();

  const result = await queryDb<{ offer_id: string; status: OfferStatus; updated_at: string }>(
    `
      UPDATE recommended_offers
      SET status = $2,
          updated_at = NOW()
      WHERE user_id = $1::uuid
      RETURNING offer_id::text, status, updated_at::text
    `,
    [guestId, status]
  );

  const row = result.rows[0];
  if (!row) {
    const err = new Error(`No saved offer found for user '${guestId}'`);
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  return row;
};
