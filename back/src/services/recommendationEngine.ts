import Groq from "groq-sdk";
import { queryDb } from "./db.js";

const WEIGHTS = {
  session_duration: 20,
  interaction_count: 15,
  room_click_rate: 15,
  voice_interaction_time: 10,
  customization_time: 10,
  idle_time_inverted: 10,
  room_time_top: 10,
  room_interactions_top: 5,
  room_sessions_top: 5,
} as const;

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

export type OfferStatus = "pending" | "accepted" | "rejected" | "sent";

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

const parseCsvList = (value: string): string[] =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

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
    JOIN ${servicesTable} s ON s.service_id = rk.service_id
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
  const servicesLabelColumn = quoteIdentifier(tables.servicesLabelColumn);

  const packs = await queryDb<PackRow>(
    `
    SELECT
      p.pack_id,
      p.pack_name,
      p.pack_code,
      p.nb_rooms,
      p.description,
      string_agg(s.service_id, ',' ORDER BY s.service_id) AS service_ids,
      string_agg(s.${servicesLabelColumn}, ', ' ORDER BY s.${servicesLabelColumn}) AS service_names
    FROM ${packTable} p
    JOIN ${packServiceTable} ps ON ps.pack_id = p.pack_id
    JOIN ${servicesTable} s ON s.service_id = ps.service_id
    WHERE p.nb_rooms = $1
    GROUP BY p.pack_id, p.pack_name, p.pack_code, p.nb_rooms, p.description
  `,
    [nbRooms]
  );

  if (!packs.rows.length) {
    const err = new Error(`No pack found for tier size ${nbRooms}`);
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  return packs.rows;
};

const fetchPackByCode = async (
  packCode: string,
  tables: TableResolution
): Promise<PackRow | undefined> => {
  const packTable = quoteIdentifier(tables.packTable);
  const packServiceTable = quoteIdentifier(tables.packServiceTable);
  const servicesTable = quoteIdentifier(tables.servicesTable);
  const servicesLabelColumn = quoteIdentifier(tables.servicesLabelColumn);

  const selected = await queryDb<PackRow>(
    `
    SELECT
      p.pack_id,
      p.pack_name,
      p.pack_code,
      p.nb_rooms,
      p.description,
      string_agg(s.service_id, ',' ORDER BY s.service_id) AS service_ids,
      string_agg(s.${servicesLabelColumn}, ', ' ORDER BY s.${servicesLabelColumn}) AS service_names
    FROM ${packTable} p
    JOIN ${packServiceTable} ps ON ps.pack_id = p.pack_id
    JOIN ${servicesTable} s ON s.service_id = ps.service_id
    WHERE p.pack_code = $1
    GROUP BY p.pack_id, p.pack_name, p.pack_code, p.nb_rooms, p.description
    LIMIT 1
  `,
    [packCode]
  );

  return selected.rows[0];
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
      status TEXT CHECK (status IN ('pending', 'accepted', 'rejected', 'sent')) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);

  // Align existing environments where the older CHECK constraint does not include 'sent'.
  await queryDb(`
    ALTER TABLE recommended_offers
    DROP CONSTRAINT IF EXISTS recommended_offers_status_check
  `);

  await queryDb(`
    ALTER TABLE recommended_offers
    ADD CONSTRAINT recommended_offers_status_check
    CHECK (status IN ('pending', 'accepted', 'rejected', 'sent'))
  `);
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
    VALUES ($1::uuid, $2::uuid, $3, $4, $5::jsonb, 'pending', NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      pack_id       = EXCLUDED.pack_id,
      tier          = EXCLUDED.tier,
      score         = EXCLUDED.score,
      offer_payload = EXCLUDED.offer_payload,
      status        = 'pending',
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
  const { guestBounds, roomBounds } = await fetchBounds(tables);

  const guestScore =
    normalize(toNum(guest.session_duration), toNum(guestBounds.max_sd)) * WEIGHTS.session_duration +
    normalize(toNum(guest.interaction_count), toNum(guestBounds.max_ic)) * WEIGHTS.interaction_count +
    normalize(toNum(guest.room_click_rate), toNum(guestBounds.max_rcr)) * WEIGHTS.room_click_rate +
    normalize(toNum(guest.voice_interaction_time), toNum(guestBounds.max_vit)) * WEIGHTS.voice_interaction_time +
    normalize(toNum(guest.customization_time), toNum(guestBounds.max_ct)) * WEIGHTS.customization_time +
    clamp01(1 - normalize(toNum(guest.idle_time), toNum(guestBounds.max_it))) * WEIGHTS.idle_time_inverted;

  const topByTime = roomRows[0];
  const topByInteractions = [...roomRows].sort(
    (a, b) => b.total_interactions_in_room - a.total_interactions_in_room
  )[0];

  const roomScore = topByTime
    ? normalize(topByTime.total_time_in_room, toNum(roomBounds.max_room_time)) * WEIGHTS.room_time_top +
      normalize(topByTime.total_interactions_in_room, toNum(roomBounds.max_room_int)) * WEIGHTS.room_interactions_top +
      normalize(topByTime.nb_sessions_in_room, toNum(roomBounds.max_room_sess)) * WEIGHTS.room_sessions_top
    : 0;

  const topRoom = topByTime?.room_name || String(guest.most_viewed_room ?? "UNKNOWN");
  const topRoomByInteractions = topByInteractions?.room_name || topRoom;
  const engagementScore = Math.round(Math.max(0, Math.min(100, guestScore + roomScore)));
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
  const ai = await callGroqRecommendation(score, packs);
  const selected = await fetchPackByCode(ai.recommended_pack_code, tables);

  if (!selected) {
    const err = new Error(`Pack code not found in DB: ${ai.recommended_pack_code}`);
    (err as Error & { status?: number }).status = 503;
    throw err;
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
      reason: ai.reason,
    },
  };

  return recommendation;
};

export const saveRecommendationForGuest = async (
  guestId: string,
  recommendation: RecommendationResult
): Promise<{ offer_id: string; updated_at: string }> => {
  const packId = recommendation.recommended_pack.pack_id ?? null;
  const row = await upsertRecommendedOffer({
    userId: guestId,
    packId,
    tier: recommendation.tier,
    score: recommendation.engagement_score,
    payload: recommendation,
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
