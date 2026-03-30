import Groq from "groq-sdk";
import { queryDb } from "./db.js";

type TableMap = {
  guestTable: string;
  servicesTable: string;
  servicesLabelColumn: string;
  usersTable: string | null;
  roomKpiTable: string;
  packTable: string;
  packServiceTable: string;
};

type GuestKpiRow = {
  id: string;
  session_duration: number | null;
  interaction_count: number | null;
  room_click_rate: number | null;
  voice_interaction_time: number | null;
  customization_time: number | null;
  idle_time: number | null;
  most_viewed_room: string | null;
  rooms_viewed: unknown;
  navigation_path: unknown;
};

type RoomKpiRow = {
  service_id: string;
  room_name: string;
  total_time_in_room: number;
  total_interactions_in_room: number;
  total_participants_in_room: number;
  nb_sessions_in_room: number;
};

type BoundsRow = {
  max_sd: number | null;
  max_ic: number | null;
  max_rcr: number | null;
  max_vit: number | null;
  max_ct: number | null;
  max_it: number | null;
};

type RoomBoundsRow = {
  max_room_time: number | null;
  max_room_int: number | null;
  max_room_sess: number | null;
};

type PackRow = {
  pack_id: string;
  pack_name: string;
  pack_code: string;
  nb_rooms: number;
  description: string | null;
  service_ids: string;
  service_names: string;
};

type ScoreTier = "Solo" | "Duo" | "Trio" | "All-Access";

type ScoreBreakdown = {
  guest_score: number;
  room_score: number;
  top_room: string;
  top_room_by_interactions: string;
};

type ScoreResult = {
  guest_id: string;
  engagement_score: number;
  tier: ScoreTier;
  nb_rooms: number;
  score_breakdown: ScoreBreakdown;
  guest_kpis: GuestKpiRow;
  room_kpis: RoomKpiRow[];
};

type OfferStatus = "pending" | "accepted" | "rejected";

type OfferUpsertRow = {
  offer_id: string;
  updated_at: Date | string;
};

type RecommendedOfferRow = {
  offer_id: string;
  user_id: string;
  pack_id: string | null;
  tier: string;
  score: number;
  offer_payload: unknown;
  status: OfferStatus;
  updated_at: Date | string;
};

type RecommendationResult = {
  offer_id: string | null;
  updated_at: string | null;
  score: number;
  offer: Record<string, unknown>;
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
};

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

const getGroqClient = () => {
  const apiKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY");
  }
  return new Groq({ apiKey });
};

const n = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const toNum = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const normalize = (value: number, max: number) => {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return clamp01(value / max);
};

const quoteIdentifier = (name: string) => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Unsupported identifier '${name}'`);
  }
  return `"${name.replace(/"/g, '""')}"`;
};

const resolveTier = (score: number): { tier: ScoreTier; nb_rooms: number } => {
  if (score <= 39) return { tier: "Solo", nb_rooms: 1 };
  if (score <= 69) return { tier: "Duo", nb_rooms: 2 };
  if (score <= 89) return { tier: "Trio", nb_rooms: 3 };
  return { tier: "All-Access", nb_rooms: 4 };
};

const parseCsvList = (value: string) =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const parseGroqJson = (raw: string) => {
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

const toIso = (value: Date | string) => {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const extractPackIdFromPayload = (payload: Record<string, unknown>): string | null => {
  const direct = payload.pack_id;
  if (direct !== undefined && direct !== null && String(direct).trim()) {
    return String(direct).trim();
  }

  const alt = payload.recommended_pack_id;
  if (alt !== undefined && alt !== null && String(alt).trim()) {
    return String(alt).trim();
  }

  return null;
};

const resolveTables = async (): Promise<TableMap> => {
  const result = await queryDb<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema='public'
      AND table_type='BASE TABLE'
  `);
  const names = new Set(result.rows.map((r) => String(r.table_name).toLowerCase()));

  const guestTable = names.has("guest") ? "guest" : (names.has("guest_kpis") ? "guest_kpis" : "");
  const servicesTable = names.has("services") ? "services" : (names.has("service") ? "service" : "");
  const roomKpiTable = names.has("room_kpi") ? "room_kpi" : "";
  const packTable = names.has("pack") ? "pack" : "";
  const packServiceTable = names.has("pack_service") ? "pack_service" : "";
  const usersTable = names.has("users") ? "users" : null;

  if (!guestTable) throw new Error("Missing guest table (expected guest or guest_kpis)");
  if (!servicesTable) throw new Error("Missing services table (expected services or service)");
  if (!roomKpiTable) throw new Error("Missing room_kpi table");
  if (!packTable || !packServiceTable) throw new Error("Missing pack catalog tables (pack, pack_service)");

  const serviceColumnsResult = await queryDb<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
  `, [servicesTable]);
  const serviceColumns = new Set(serviceColumnsResult.rows.map((r) => String(r.column_name).toLowerCase()));
  const servicesLabelColumn = serviceColumns.has("service")
    ? "service"
    : serviceColumns.has("service_name")
      ? "service_name"
      : serviceColumns.has("name")
        ? "name"
        : "service_id";

  return { guestTable, servicesTable, servicesLabelColumn, usersTable, roomKpiTable, packTable, packServiceTable };
};

const fetchGuestKpis = async (guestId: string, tables: TableMap) => {
  const guestTable = quoteIdentifier(tables.guestTable);
  const guest = tables.guestTable === "guest_kpis"
    ? await queryDb<GuestKpiRow>(`
      SELECT
        user_id AS id,
        session_duration,
        interaction_count,
        room_click_rate,
        voice_interaction_time,
        customization_time,
        idle_time,
        NULL::text AS most_viewed_room,
        NULL::text AS rooms_viewed,
        navigation_path
      FROM ${guestTable}
      WHERE user_id = $1
      ORDER BY calculated_at DESC NULLS LAST
      LIMIT 1
    `, [guestId])
    : await queryDb<GuestKpiRow>(`
      SELECT
        id,
        session_duration,
        interaction_count,
        room_click_rate,
        voice_interaction_time,
        customization_time,
        idle_time,
        most_viewed_room,
        rooms_viewed,
        navigation_path
      FROM ${guestTable}
      WHERE id = $1
      LIMIT 1
    `, [guestId]);

  if (!guest.rows[0]) {
    if (tables.usersTable) {
      const usersTable = quoteIdentifier(tables.usersTable);
      const userExists = await queryDb<{ exists: boolean }>(`
        SELECT EXISTS(
          SELECT 1 FROM ${usersTable} WHERE user_id = $1
        ) AS exists
      `, [guestId]);

      if (userExists.rows[0]?.exists) {
        return {
          id: guestId,
          session_duration: 0,
          interaction_count: 0,
          room_click_rate: 0,
          voice_interaction_time: 0,
          customization_time: 0,
          idle_time: 0,
          most_viewed_room: null,
          rooms_viewed: null,
          navigation_path: null,
        } satisfies GuestKpiRow;
      }
    }

    const err = new Error(`Guest '${guestId}' not found`);
    (err as Error & { status?: number }).status = 404;
    throw err;
  }

  return guest.rows[0];
};

const fetchRoomKpis = async (guestId: string, tables: TableMap) => {
  const roomKpiTable = quoteIdentifier(tables.roomKpiTable);
  const servicesTable = quoteIdentifier(tables.servicesTable);
  const servicesLabelColumn = quoteIdentifier(tables.servicesLabelColumn);

  const roomRows = await queryDb<RoomKpiRow>(`
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
  `, [guestId]);

  return roomRows.rows.map((row) => ({
    ...row,
    total_time_in_room: toNum(row.total_time_in_room),
    total_interactions_in_room: toNum(row.total_interactions_in_room),
    total_participants_in_room: toNum(row.total_participants_in_room),
    nb_sessions_in_room: toNum(row.nb_sessions_in_room),
  }));
};

const fetchBounds = async (tables: TableMap) => {
  const guestTable = quoteIdentifier(tables.guestTable);
  const roomKpiTable = quoteIdentifier(tables.roomKpiTable);

  const guestBounds = await queryDb<BoundsRow>(`
    SELECT
      MAX(session_duration)::numeric AS max_sd,
      MAX(interaction_count)::numeric AS max_ic,
      MAX(room_click_rate::numeric)::numeric AS max_rcr,
      MAX(voice_interaction_time)::numeric AS max_vit,
      MAX(customization_time)::numeric AS max_ct,
      MAX(idle_time)::numeric AS max_it
    FROM ${guestTable}
  `);

  const roomBounds = await queryDb<RoomBoundsRow>(`
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
  `);

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

const fetchPacksForTier = async (nbRooms: number, tables: TableMap) => {
  const packTable = quoteIdentifier(tables.packTable);
  const packServiceTable = quoteIdentifier(tables.packServiceTable);
  const servicesTable = quoteIdentifier(tables.servicesTable);
  const servicesLabelColumn = quoteIdentifier(tables.servicesLabelColumn);

  const packs = await queryDb<PackRow>(`
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
  `, [nbRooms]);

  if (packs.rows.length) {
    return packs.rows;
  }

  // Fallback when pack_service has no rows: still use pack catalog by tier.
  const packOnly = await queryDb<Omit<PackRow, "service_ids" | "service_names">>(`
    SELECT
      p.pack_id,
      p.pack_name,
      p.pack_code,
      p.nb_rooms,
      p.description
    FROM ${packTable} p
    WHERE p.nb_rooms = $1
    ORDER BY p.pack_code
  `, [nbRooms]);

  if (!packOnly.rows.length) {
    const err = new Error("Pack table is empty for requested tier");
    (err as Error & { status?: number }).status = 500;
    throw err;
  }

  return packOnly.rows.map((row) => ({
    ...row,
    service_ids: "",
    service_names: "",
  }));
};

const fetchPackByCode = async (packCode: string, tables: TableMap) => {
  const packTable = quoteIdentifier(tables.packTable);
  const packServiceTable = quoteIdentifier(tables.packServiceTable);
  const servicesTable = quoteIdentifier(tables.servicesTable);
  const servicesLabelColumn = quoteIdentifier(tables.servicesLabelColumn);

  const selected = await queryDb<PackRow>(`
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
  `, [packCode]);

  if (selected.rows[0]) return selected.rows[0];

  const packOnly = await queryDb<Omit<PackRow, "service_ids" | "service_names">>(`
    SELECT
      p.pack_id,
      p.pack_name,
      p.pack_code,
      p.nb_rooms,
      p.description
    FROM ${packTable} p
    WHERE p.pack_code = $1
    LIMIT 1
  `, [packCode]);

  const row = packOnly.rows[0];
  if (!row) return undefined;
  return {
    ...row,
    service_ids: "",
    service_names: "",
  };
};

const computeScore = async (guestId: string): Promise<ScoreResult> => {
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
    ? (
      normalize(topByTime.total_time_in_room, toNum(roomBounds.max_room_time)) * WEIGHTS.room_time_top
      + normalize(topByTime.total_interactions_in_room, toNum(roomBounds.max_room_int)) * WEIGHTS.room_interactions_top
      + normalize(topByTime.nb_sessions_in_room, toNum(roomBounds.max_room_sess)) * WEIGHTS.room_sessions_top
    )
    : 0;

  const topRoom = topByTime?.room_name || String(guest.most_viewed_room ?? "UNKNOWN");
  const topRoomByInteractions = topByInteractions?.room_name || topRoom;

  const engagementScore = Math.round(Math.max(0, Math.min(100, guestScore + roomScore)));
  const { tier, nb_rooms } = resolveTier(engagementScore);

  return {
    guest_id: guestId,
    engagement_score: engagementScore,
    tier,
    nb_rooms,
    score_breakdown: {
      guest_score: Math.round(guestScore),
      room_score: Math.round(roomScore),
      top_room: topRoom,
      top_room_by_interactions: topRoomByInteractions,
    },
    guest_kpis: guest,
    room_kpis: roomRows,
  };
};

const callGroqRecommendation = async (
  score: ScoreResult,
  packs: PackRow[]
): Promise<{
  recommended_pack_code: string;
  reason: string;
  pack_id: string | null;
  offer_payload: Record<string, unknown>;
}> => {
  const groq = getGroqClient();

  const payload = {
    guest_kpis: score.guest_kpis,
    room_kpis: score.room_kpis,
    engagement_score: score.engagement_score,
    tier: score.tier,
    nb_rooms: score.nb_rooms,
    top_room: score.score_breakdown.top_room,
    top_room_by_interactions: score.score_breakdown.top_room_by_interactions,
    packs,
  };

  const messages = [
    {
      role: "system" as const,
      content: "You are an intelligent offer recommendation engine for TalentVerse. Analyze guest KPIs and room-level KPIs. Select ONE best matching pack from provided packs. Prioritize top room by time and top room by interactions. Return ONLY valid JSON with keys: recommended_pack_code, reason.",
    },
    {
      role: "user" as const,
      content: `GUEST-LEVEL KPIs (from guest table):\n${JSON.stringify(payload.guest_kpis, null, 2)}\n\nROOM-LEVEL KPIs (from room_kpi table, ranked by time spent):\n${JSON.stringify(payload.room_kpis, null, 2)}\n\nTop room by time: ${payload.top_room}\nTop room by interactions: ${payload.top_room_by_interactions}\n\nEngagement score: ${payload.engagement_score}/100\nTier: ${payload.tier} (${payload.nb_rooms} room(s))\n\nAVAILABLE PACKS FOR THIS TIER (from database):\n${JSON.stringify(payload.packs, null, 2)}\n\nINSTRUCTION: Select the pack that best covers the rooms this guest is most engaged with. Prioritize packs that include ${payload.top_room} and ${payload.top_room_by_interactions}. Return ONLY JSON.`,
    },
  ];

  const response = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages,
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 600,
  });

  const raw = String(response.choices?.[0]?.message?.content ?? "");
  const parsed = parseGroqJson(raw) as Record<string, unknown>;

  const recommendedPackCode = String(parsed.recommended_pack_code ?? "").trim();
  const reason = String(parsed.reason ?? "").trim();
  if (!recommendedPackCode) {
    throw new Error("Groq returned empty recommended_pack_code");
  }

  return {
    recommended_pack_code: recommendedPackCode,
    reason: reason || "Recommended by AI from guest and room-level engagement signals.",
    pack_id: extractPackIdFromPayload(parsed),
    offer_payload: parsed,
  };
};

const upsertRecommendedOffer = async ({
  userId,
  packId,
  tier,
  score,
  offerPayload,
}: {
  userId: string;
  packId: string | null;
  tier: string;
  score: number;
  offerPayload: Record<string, unknown>;
}): Promise<{ offer_id: string; updated_at: string } | null> => {
  try {
    const result = await queryDb<OfferUpsertRow>(`
      INSERT INTO recommended_offers
        (user_id, pack_id, tier, score, offer_payload, status, updated_at)
      VALUES ($1, $2, $3, $4, $5::jsonb, 'pending', NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        pack_id       = EXCLUDED.pack_id,
        tier          = EXCLUDED.tier,
        score         = EXCLUDED.score,
        offer_payload = EXCLUDED.offer_payload,
        status        = 'pending',
        updated_at    = NOW()
      RETURNING offer_id, updated_at;
    `, [userId, packId, tier, score, JSON.stringify(offerPayload)]);

    const row = result.rows[0];
    if (!row) return null;

    return {
      offer_id: row.offer_id,
      updated_at: toIso(row.updated_at),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Offer upsert failed for user '${userId}': ${message}`);
    return null;
  }
};

export const getCurrentOfferByUserId = async (userId: string) => {
  const result = await queryDb<RecommendedOfferRow>(`
    SELECT offer_id, user_id, pack_id, tier, score, offer_payload, status, updated_at
    FROM recommended_offers
    WHERE user_id = $1
    LIMIT 1
  `, [userId]);

  const row = result.rows[0];
  if (!row) return null;

  return {
    offer_id: row.offer_id,
    user_id: row.user_id,
    pack_id: row.pack_id,
    tier: row.tier,
    score: Number(row.score),
    status: row.status,
    updated_at: toIso(row.updated_at),
    offer: (typeof row.offer_payload === "object" && row.offer_payload !== null)
      ? row.offer_payload as Record<string, unknown>
      : {},
  };
};

export const updateOfferStatusById = async (offerId: string, status: OfferStatus) => {
  const result = await queryDb<RecommendedOfferRow>(`
    UPDATE recommended_offers
    SET status = $2,
        updated_at = NOW()
    WHERE offer_id = $1
    RETURNING offer_id, user_id, pack_id, tier, score, offer_payload, status, updated_at
  `, [offerId, status]);

  const row = result.rows[0];
  if (!row) return null;

  return {
    offer_id: row.offer_id,
    user_id: row.user_id,
    pack_id: row.pack_id,
    tier: row.tier,
    score: Number(row.score),
    status: row.status,
    updated_at: toIso(row.updated_at),
    offer: (typeof row.offer_payload === "object" && row.offer_payload !== null)
      ? row.offer_payload as Record<string, unknown>
      : {},
  };
};

export const getGuestScore = async (guestId: string) => {
  const score = await computeScore(guestId);
  return {
    guest_id: score.guest_id,
    engagement_score: score.engagement_score,
    tier: score.tier,
    score_breakdown: score.score_breakdown,
  };
};

export const recommendForGuest = async (guestId: string): Promise<RecommendationResult> => {
  const score = await computeScore(guestId);
  const tables = await resolveTables();
  const packs = await fetchPacksForTier(score.nb_rooms, tables);

  const ai = await callGroqRecommendation(score, packs);
  const selected = await fetchPackByCode(ai.recommended_pack_code, tables);
  
  if (!selected) {
    throw new Error(`No pack found with code: ${ai.recommended_pack_code}`);
  }

  const persisted = await upsertRecommendedOffer({
    userId: score.guest_id,
    packId: ai.pack_id,
    tier: score.tier,
    score: Number(score.engagement_score.toFixed(1)),
    offerPayload: ai.offer_payload,
  });

  return {
    offer_id: persisted?.offer_id ?? null,
    updated_at: persisted?.updated_at ?? null,
    score: Number(score.engagement_score.toFixed(1)),
    offer: ai.offer_payload,
    guest_id: score.guest_id,
    engagement_score: score.engagement_score,
    tier: score.tier,
    score_breakdown: score.score_breakdown,
    recommended_pack: {
      pack_code: selected.pack_code,
      pack_name: selected.pack_name,
      nb_rooms: selected.nb_rooms,
      services: parseCsvList(selected.service_names),
      reason: ai.reason,
    },
  };
};
