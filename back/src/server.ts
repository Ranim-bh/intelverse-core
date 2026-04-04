import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import {
  loadDataset as loadTable,
  loadDatasets as loadTables,
  type DatasetsMap,
} from "./services/datasetLoader.js";
import {
  getGuestScore,
  recommendForGuest,
  saveRecommendationForGuest,
  listRecommendedOffers,
  updateRecommendedOfferStatus,
  getLeadScoringWeights,
  saveLeadScoringWeights,
  getAvailableRecommendedOfferKpis,
  type OfferStatus,
  type LeadScoringWeightRow,
} from "./services/recommendationEngine.js";
import { getDbPool, queryDb } from "./services/db.js";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json());

const GROQ_API_KEY = (process.env.GROQ_API_KEY ?? "").trim();
const SERVICES_TABLE_KEY = (process.env.SERVICES_TABLE_KEY ?? "services").trim().toLowerCase();
const groq = new Groq({ apiKey: GROQ_API_KEY });

type TableRow = Record<string, unknown>;

type ServiceOption = {
  id: string;
  name: string;
  price: number;
};

type PackService = {
  id: string;
  name: string;
  price: number;
  reason: string;
};

type AccessRole = {
  id: string;
  name: string;
  isDefault: boolean;
};

type AccessService = {
  id: string;
  name: string;
};

type AccessMatrix = Record<string, Record<string, boolean>>;

const DEFAULT_ACCESS_ROLES: AccessRole[] = [
  { id: "guest", name: "Guest", isDefault: true },
  { id: "client", name: "Client", isDefault: true },
  { id: "partenaire", name: "Partenaire", isDefault: true },
];

const DEFAULT_ACCESS_SERVICES: AccessService[] = [
  { id: "training_center", name: "Training Center" },
  { id: "pitch_room", name: "Pitch Room" },
  { id: "showcase_room", name: "Showcase Room" },
  { id: "opportunity_room", name: "Opportunity Room" },
];

const DEFAULT_ACCESS_GRANTS: Record<string, string[]> = {
  guest: ["showcase_room"],
  client: ["training_center", "showcase_room", "opportunity_room"],
  partenaire: ["training_center", "pitch_room", "showcase_room", "opportunity_room"],
};

const slugifyId = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const createEntityId = (name: string): string => {
  const base = slugifyId(name) || "item";
  return `${base}_${Date.now()}`;
};

const toSafeIdentifier = (name: string): string => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Unsupported identifier '${name}'`);
  }
  return `"${name.replace(/"/g, '""')}"`;
};

const getTableColumns = async (tableName: string): Promise<Set<string>> => {
  const result = await queryDb<{ column_name: string }>(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name=$1
  `,
    [tableName]
  );
  return new Set(result.rows.map((row) => String(row.column_name).toLowerCase()));
};

const ensureAccessMatrixTables = async (): Promise<void> => {
  await queryDb(`
    CREATE TABLE IF NOT EXISTS admin_roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      is_default BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await queryDb(`
    CREATE TABLE IF NOT EXISTS admin_services (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await queryDb(`
    CREATE TABLE IF NOT EXISTS admin_access_matrix (
      role_id TEXT NOT NULL REFERENCES admin_roles(id) ON DELETE CASCADE,
      service_id TEXT NOT NULL REFERENCES admin_services(id) ON DELETE CASCADE,
      has_access BOOLEAN NOT NULL DEFAULT false,
      PRIMARY KEY (role_id, service_id)
    )
  `);

  const roleCount = await queryDb<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_roles");
  const serviceCount = await queryDb<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_services");

  if (Number(roleCount.rows[0]?.count ?? 0) === 0) {
    for (const role of DEFAULT_ACCESS_ROLES) {
      await queryDb(
        `INSERT INTO admin_roles (id, name, is_default) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING`,
        [role.id, role.name, role.isDefault]
      );
    }
  }

  if (Number(serviceCount.rows[0]?.count ?? 0) === 0) {
    for (const service of DEFAULT_ACCESS_SERVICES) {
      await queryDb(
        `INSERT INTO admin_services (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
        [service.id, service.name]
      );
    }
  }

  const matrixCount = await queryDb<{ count: string }>("SELECT COUNT(*)::text AS count FROM admin_access_matrix");
  if (Number(matrixCount.rows[0]?.count ?? 0) === 0) {
    const roles = await queryDb<AccessRole>("SELECT id, name, is_default AS \"isDefault\" FROM admin_roles");
    const services = await queryDb<AccessService>("SELECT id, name FROM admin_services");

    for (const role of roles.rows) {
      for (const service of services.rows) {
        const granted = Boolean(DEFAULT_ACCESS_GRANTS[role.id]?.includes(service.id));
        await queryDb(
          `
          INSERT INTO admin_access_matrix (role_id, service_id, has_access)
          VALUES ($1, $2, $3)
          ON CONFLICT (role_id, service_id) DO NOTHING
        `,
          [role.id, service.id, granted]
        );
      }
    }
  }
};

const mirrorServiceToCoreTable = async (service: AccessService): Promise<void> => {
  const tableExists = await queryDb<{ exists: boolean }>(
    `
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='service'
    ) AS exists
  `
  );

  if (!tableExists.rows[0]?.exists) {
    return;
  }

  const columns = await getTableColumns("service");
  const insertColumns: string[] = [];
  const values: unknown[] = [];
  const placeholders: string[] = [];

  if (columns.has("service_id")) {
    insertColumns.push("service_id");
    values.push(service.id.toUpperCase());
    placeholders.push(`$${values.length}`);
  }

  if (columns.has("service_name")) {
    insertColumns.push("service_name");
    values.push(service.name);
    placeholders.push(`$${values.length}`);
  } else if (columns.has("service")) {
    insertColumns.push("service");
    values.push(service.name);
    placeholders.push(`$${values.length}`);
  } else if (columns.has("name")) {
    insertColumns.push("name");
    values.push(service.name);
    placeholders.push(`$${values.length}`);
  }

  if (columns.has("price")) {
    insertColumns.push("price");
    values.push(0);
    placeholders.push(`$${values.length}`);
  }

  if (!insertColumns.length) return;

  try {
    await queryDb(
      `INSERT INTO service (${insertColumns.join(", ")}) VALUES (${placeholders.join(", ")})`,
      values
    );
  } catch {
    // Ignore duplicate conflicts without preventing admin matrix updates.
  }
};

const removeServiceFromCoreTable = async (service: AccessService): Promise<void> => {
  const tableExists = await queryDb<{ exists: boolean }>(
    `
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='service'
    ) AS exists
  `
  );

  if (!tableExists.rows[0]?.exists) {
    return;
  }

  const columns = await getTableColumns("service");
  const predicates: string[] = [];
  const values: unknown[] = [];

  if (columns.has("service_id")) {
    values.push(service.id.toUpperCase());
    predicates.push(`service_id=$${values.length}`);
  }

  if (columns.has("service_name")) {
    values.push(service.name);
    predicates.push(`service_name=$${values.length}`);
  }

  if (columns.has("service")) {
    values.push(service.name);
    predicates.push(`service=$${values.length}`);
  }

  if (columns.has("name")) {
    values.push(service.name);
    predicates.push(`name=$${values.length}`);
  }

  if (!predicates.length) {
    return;
  }

  await queryDb(`DELETE FROM service WHERE ${predicates.join(" OR ")}`, values);
};

const syncUsersRoleConstraint = async (): Promise<void> => {
  const tableExists = await queryDb<{ exists: boolean }>(
    `
    SELECT EXISTS(
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='users'
    ) AS exists
  `
  );

  if (!tableExists.rows[0]?.exists) return;

  const columns = await getTableColumns("users");
  if (!columns.has("role")) return;

  const roles = await queryDb<{ name: string }>("SELECT name FROM admin_roles ORDER BY created_at ASC");
  const existing = await queryDb<{ role: string | null }>("SELECT DISTINCT role FROM users WHERE role IS NOT NULL");

  const all = new Set<string>();
  for (const row of roles.rows) all.add(String(row.name).trim());
  for (const row of existing.rows) all.add(String(row.role ?? "").trim());

  const allowed = Array.from(all).filter(Boolean);
  if (!allowed.length) return;

  const constraints = await queryDb<{ conname: string; def: string }>(
    `
    SELECT conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.conrelid = 'users'::regclass
      AND c.contype = 'c'
  `
  );

  for (const row of constraints.rows) {
    const def = String(row.def ?? "").toLowerCase();
    if (def.includes("role")) {
      await queryDb(`ALTER TABLE users DROP CONSTRAINT IF EXISTS ${toSafeIdentifier(row.conname)}`);
    }
  }

  const allowedSql = allowed.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ");
  await queryDb(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (${allowedSql}))`);
};

const getAdminAccessMatrixPayload = async (): Promise<{
  roles: AccessRole[];
  services: AccessService[];
  matrix: AccessMatrix;
}> => {
  await ensureAccessMatrixTables();

  const roles = await queryDb<AccessRole>(
    `SELECT id, name, is_default AS "isDefault" FROM admin_roles ORDER BY created_at ASC, name ASC`
  );
  const services = await queryDb<AccessService>(
    `SELECT id, name FROM admin_services ORDER BY created_at ASC, name ASC`
  );
  const cells = await queryDb<{ role_id: string; service_id: string; has_access: boolean }>(
    `SELECT role_id, service_id, has_access FROM admin_access_matrix`
  );

  const matrix: AccessMatrix = {};
  for (const role of roles.rows) {
    matrix[role.id] = {};
    for (const service of services.rows) {
      const row = matrix[role.id];
      if (row) {
        row[service.id] = false;
      }
    }
  }
  for (const cell of cells.rows) {
    const row = matrix[cell.role_id];
    if (row) {
      row[cell.service_id] = Boolean(cell.has_access);
    }
  }

  return { roles: roles.rows, services: services.rows, matrix };
};

type GeneratedPackResponse = {
  main_interest?: string;
  recommended_pack?: Array<{
    service: string;
    reason: string;
  }>;
  offer_message?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  pack?: {
    name: string;
    description: string;
    services: PackService[];
    total_price: number;
    kpis_addressed: string[];
    match_score: string;
    summary: string;
  };
};

const ensureTables = async () => {
  return loadTables(true);
};

const extractJsonObject = (raw: string) => {
  const fenced = raw.replace(/```json|```/g, "").trim();
  try {
    return JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = fenced.slice(start, end + 1);
      return JSON.parse(sliced);
    }
    throw new Error("Groq response is not valid JSON");
  }
};

const normalizeKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toRows = (value: unknown): TableRow[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is TableRow => typeof row === "object" && row !== null);
};

const pickFromRow = (row: TableRow, candidates: string[]): unknown => {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const target = normalizeKey(candidate);
    const found = entries.find(([key]) => {
      const normalized = normalizeKey(key);
      return normalized === target || normalized.includes(target);
    });

    if (found && found[1] !== "" && found[1] !== undefined && found[1] !== null) {
      return found[1];
    }
  }
  return undefined;
};

const inferNumericKpis = (row: TableRow): Record<string, number> => {
  const reserved = new Set([
    "id", "guestid", "partnerid", "profileid", "serviceid", "service", "domain",
    "type", "typeclient", "company", "name", "status", "statut", "role", "source",
    "createdat", "month", "risklevel", "churn", "targetconverted", "targetchurn", "targetupsell",
  ]);

  const kpis: Record<string, number> = {};
  for (const [key, rawValue] of Object.entries(row)) {
    const normalized = normalizeKey(key);
    if (!normalized || reserved.has(normalized)) continue;
    const value = toNumber(rawValue, Number.NaN);
    if (!Number.isNaN(value)) {
      kpis[key] = value;
    }
  }
  return kpis;
};

const parseServicesTable = (value: unknown): ServiceOption[] => {
  return toRows(value)
    .map((row) => {
      const id = String(pickFromRow(row, ["service_id", "id"]) ?? "").trim();
      const name = String(pickFromRow(row, ["service", "service_name", "name"]) ?? "").trim();
      const price = toNumber(pickFromRow(row, ["price", "cost", "amount"]), 0);
      if (!id || !name) return null;
      return { id, name, price };
    })
    .filter((service): service is ServiceOption => service !== null);
};

const pickTableByPattern = (tables: Record<string, unknown>, patterns: RegExp[]): unknown => {
  for (const [key, value] of Object.entries(tables)) {
    if (patterns.some((pattern) => pattern.test(key))) {
      return value;
    }
  }
  return undefined;
};

const buildUserProfile = (userId: string, tables: Record<string, unknown>) => {
  const globalRows = toRows(
    tables.global_dataset
      ?? pickTableByPattern(tables, [/^global_dataset/i, /^users?$/i, /^guests?$/i])
  );
  const guestRows = toRows(
    tables.guest_kpis
      ?? pickTableByPattern(tables, [/^guest_kpis/i])
  );
  const partnerRows = toRows(
    tables.partner_kpis
      ?? pickTableByPattern(tables, [/^partner_kpis/i])
  );
  const churnRows = toRows(
    tables.churn_kpis
      ?? pickTableByPattern(tables, [/^churn_kpis/i])
  );

  const userRow = [...globalRows, ...guestRows, ...partnerRows, ...churnRows].find((row) => {
    const id = String(pickFromRow(row, ["id", "guest_id", "partner_id", "profile_id"]) ?? "").trim();
    return id.toLowerCase() === userId.toLowerCase();
  });

  if (!userRow) {
    return { error: "User not found", status: 404 as const };
  }

  const domain = String(pickFromRow(userRow, ["domain", "type_client", "type", "industry"]) ?? "").trim();
  const experience = String(pickFromRow(userRow, ["experience", "seniority", "years_experience"]) ?? "N/A").trim() || "N/A";
  const skillsRaw = pickFromRow(userRow, ["skills", "competencies", "stack"]);
  const skills = Array.isArray(skillsRaw)
    ? skillsRaw.map((item) => String(item))
    : String(skillsRaw ?? "").split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  const location = String(pickFromRow(userRow, ["location", "country", "city"]) ?? "N/A").trim() || "N/A";

  const relatedRows = [...globalRows, ...guestRows, ...partnerRows, ...churnRows].filter((row) => {
    const id = String(pickFromRow(row, ["id", "guest_id", "partner_id", "profile_id"]) ?? "").trim();
    return id.toLowerCase() === userId.toLowerCase();
  });

  const kpis = relatedRows.reduce<Record<string, number>>((acc, row) => {
    const rowKpis = inferNumericKpis(row);
    for (const [key, value] of Object.entries(rowKpis)) {
      acc[key] = value;
    }
    return acc;
  }, {});

  const effectiveKpis = Object.keys(kpis).length
    ? kpis
    : {
      session_duration: toNumber(pickFromRow(userRow, ["session_duration", "duration", "session"]), 0),
      interaction_count: toNumber(pickFromRow(userRow, ["interaction_count", "interactions", "clicks"]), 0),
      voice_time: toNumber(pickFromRow(userRow, ["voice_time", "voice_interaction_time"]), 0),
      idle_time: toNumber(pickFromRow(userRow, ["idle_time", "idle"]), 0),
      engagement_score: toNumber(pickFromRow(userRow, ["engagement_score", "performance"]), 0),
      conversion_prob: toNumber(pickFromRow(userRow, ["conversion_prob", "conversion_probability"]), 0),
    };

  const effectiveDomain = domain || String(pickFromRow(userRow, ["domain", "type_client", "type"]) ?? "Unknown");

  return {
    user: {
      id: userId,
      domain: effectiveDomain,
      experience,
      skills,
      location,
      kpis: {
        ...effectiveKpis,
        performance: effectiveKpis.performance ?? effectiveKpis.engagement_score ?? 0,
      } as Record<string, number | string>,
    },
  };
};

const parsePackResponse = (raw: string): GeneratedPackResponse => {
  const parsed = extractJsonObject(raw) as GeneratedPackResponse;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Failed to parse AI response");
  }

  const hasNewSchema = Array.isArray(parsed.recommended_pack);
  const hasPackSchema = Boolean(parsed.pack && Array.isArray(parsed.pack.services));
  if (!hasNewSchema && !hasPackSchema) {
    throw new Error("Failed to parse AI response");
  }
  return parsed;
};

const sanitizeMatchScore = (raw: unknown, fallback: number): string => {
  const value = String(raw ?? "").trim();
  if (/^\d{1,3}%$/.test(value)) return value;
  return `${fallback}%`;
};

const priorityToMatchScore = (priority: string | undefined, fallback: number): string => {
  const p = String(priority ?? "").toUpperCase();
  if (p === "HIGH") return "92%";
  if (p === "MEDIUM") return "80%";
  if (p === "LOW") return "68%";
  return `${fallback}%`;
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "intelverse-backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/tables", async (_req, res) => {
  try {
    const tables = await ensureTables();
    return res.json(tables);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load tables";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/tables/:key", async (req, res) => {
  try {
    const tables = await ensureTables();
    const { key } = req.params;
    const value = tables[key];
    if (value === undefined) {
      return res.status(404).json({ error: `Table '${key}' not found` });
    }
    return res.json(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load tables";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/datasets", async (_req, res) => {
  try {
    const tables = await ensureTables();
    return res.json(tables);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load data";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/datasets/:key", async (req, res) => {
  try {
    const tables = await ensureTables();
    const { key } = req.params;
    const value = tables[key];
    if (value === undefined) {
      return res.status(404).json({ error: `Table '${key}' not found` });
    }
    return res.json(value);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load data";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/lead-scoring/weights", async (_req, res) => {
  try {
    const rows = await getLeadScoringWeights();
    return res.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load lead scoring weights";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/lead-scoring/kpis", async (_req, res) => {
  try {
    const rows = await getAvailableRecommendedOfferKpis();
    return res.json(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load KPI list";
    return res.status(500).json({ error: message });
  }
});

app.put("/api/lead-scoring/weights", async (req, res) => {
  try {
    const payload = req.body as unknown;
    if (!Array.isArray(payload)) {
      return res.status(400).json({ error: "Expected an array of lead scoring rows" });
    }

    const rows = payload as Array<Pick<LeadScoringWeightRow, "kpi_key" | "label" | "category" | "weight" | "is_default">>;
    const saved = await saveLeadScoringWeights(rows);
    return res.json(saved);
  } catch (error) {
    const typed = error as Error & { status?: number };
    const status = typeof typed.status === "number" ? typed.status : 500;
    const message = error instanceof Error ? error.message : "Failed to save lead scoring weights";
    return res.status(status).json({ error: message });
  }
});

app.get("/api/admin/access-matrix", async (_req, res) => {
  try {
    const payload = await getAdminAccessMatrixPayload();
    return res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load access matrix";
    return res.status(500).json({ error: message });
  }
});

app.patch("/api/admin/access-matrix", async (req, res) => {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    const payload = req.body as {
      roles?: AccessRole[];
      services?: AccessService[];
      matrix?: AccessMatrix;
    };

    if (!payload || !Array.isArray(payload.roles) || !Array.isArray(payload.services) || !payload.matrix) {
      return res.status(400).json({ error: "Invalid payload. Expected { roles, services, matrix }" });
    }

    await ensureAccessMatrixTables();
    await client.query("BEGIN");

    await client.query("DELETE FROM admin_access_matrix");
    await client.query("DELETE FROM admin_roles");
    await client.query("DELETE FROM admin_services");

    for (const role of payload.roles) {
      await client.query(
        `INSERT INTO admin_roles (id, name, is_default) VALUES ($1, $2, $3)`,
        [role.id, role.name, Boolean(role.isDefault)]
      );
    }

    for (const service of payload.services) {
      await client.query(`INSERT INTO admin_services (id, name) VALUES ($1, $2)`, [service.id, service.name]);
    }

    for (const role of payload.roles) {
      for (const service of payload.services) {
        const hasAccess = Boolean(payload.matrix?.[role.id]?.[service.id]);
        await client.query(
          `INSERT INTO admin_access_matrix (role_id, service_id, has_access) VALUES ($1, $2, $3)`,
          [role.id, service.id, hasAccess]
        );
      }
    }

    await client.query("COMMIT");

    for (const service of payload.services) {
      await mirrorServiceToCoreTable(service);
    }
    await syncUsersRoleConstraint();

    const out = await getAdminAccessMatrixPayload();
    return res.json(out);
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to save access matrix";
    return res.status(500).json({ error: message });
  } finally {
    client.release();
  }
});

app.post("/api/admin/roles", async (req, res) => {
  try {
    await ensureAccessMatrixTables();
    const name = String((req.body as { name?: string })?.name ?? "").trim();
    if (!name) {
      return res.status(400).json({ error: "Missing role name" });
    }

    const role: AccessRole = {
      id: createEntityId(name),
      name,
      isDefault: false,
    };

    await queryDb(`INSERT INTO admin_roles (id, name, is_default) VALUES ($1, $2, false)`, [role.id, role.name]);

    const services = await queryDb<AccessService>("SELECT id, name FROM admin_services");
    for (const service of services.rows) {
      await queryDb(
        `INSERT INTO admin_access_matrix (role_id, service_id, has_access) VALUES ($1, $2, false)`,
        [role.id, service.id]
      );
    }

    await syncUsersRoleConstraint();
    return res.status(201).json(role);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create role";
    return res.status(500).json({ error: message });
  }
});

app.delete("/api/admin/roles/:id", async (req, res) => {
  try {
    await ensureAccessMatrixTables();
    const id = String(req.params.id ?? "").trim();
    if (!id) {
      return res.status(400).json({ error: "Missing role id" });
    }

    const roleRes = await queryDb<AccessRole>(
      `SELECT id, name, is_default AS "isDefault" FROM admin_roles WHERE id=$1`,
      [id]
    );
    const role = roleRes.rows[0];
    if (!role) return res.status(404).json({ error: "Role not found" });
    if (role.isDefault) return res.status(400).json({ error: "Default roles cannot be deleted" });

    await queryDb(`DELETE FROM admin_roles WHERE id=$1`, [id]);
    await syncUsersRoleConstraint();
    return res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete role";
    return res.status(500).json({ error: message });
  }
});

app.post("/api/admin/services", async (req, res) => {
  try {
    await ensureAccessMatrixTables();
    const name = String((req.body as { name?: string })?.name ?? "").trim();
    if (!name) {
      return res.status(400).json({ error: "Missing service name" });
    }

    const service: AccessService = {
      id: createEntityId(name),
      name,
    };

    await queryDb(`INSERT INTO admin_services (id, name) VALUES ($1, $2)`, [service.id, service.name]);

    const roles = await queryDb<AccessRole>("SELECT id, name, is_default AS \"isDefault\" FROM admin_roles");
    for (const role of roles.rows) {
      await queryDb(
        `INSERT INTO admin_access_matrix (role_id, service_id, has_access) VALUES ($1, $2, false)`,
        [role.id, service.id]
      );
    }

    await mirrorServiceToCoreTable(service);
    return res.status(201).json(service);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create service";
    return res.status(500).json({ error: message });
  }
});

app.delete("/api/admin/services/:id", async (req, res) => {
  try {
    await ensureAccessMatrixTables();
    const rawIdentifier = String(req.params.id ?? "").trim();
    if (!rawIdentifier) {
      return res.status(400).json({ error: "Missing service id" });
    }

    const serviceRes = await queryDb<AccessService>(
      `
      SELECT id, name
      FROM admin_services
      WHERE id=$1 OR LOWER(name)=LOWER($1)
      LIMIT 1
    `,
      [rawIdentifier]
    );
    const service = serviceRes.rows[0];
    if (!service) return res.status(404).json({ error: "Service not found" });

    await queryDb(`DELETE FROM admin_services WHERE id=$1 OR LOWER(name)=LOWER($1)`, [rawIdentifier]);

    // Best effort mirror cleanup from the core service table.
    try {
      await removeServiceFromCoreTable(service);
    } catch {
      // ignore if core table columns differ
    }

    return res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete service";
    return res.status(500).json({ error: message });
  }
});

app.get("/api/recommend/:guest_id/score", async (req, res) => {
  try {
    const guestId = String(req.params.guest_id ?? "").trim();
    if (!guestId) {
      return res.status(400).json({ error: "Missing guest_id" });
    }

    const result = await getGuestScore(guestId);
    return res.json(result);
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === "number"
      ? Number((error as { status?: number }).status)
      : 500;
    const message = error instanceof Error ? error.message : "Failed to compute score";
    return res.status(status).json({ error: message });
  }
});

app.post("/api/recommend/:guest_id", async (req, res) => {
  try {
    const guestId = String(req.params.guest_id ?? "").trim();
    if (!guestId) {
      return res.status(400).json({ error: "Missing guest_id" });
    }

    const result = await recommendForGuest(guestId);
    return res.json(result);
  } catch (error) {
    const typed = error as Error & { status?: number };
    const status = typeof typed.status === "number" ? typed.status : 500;
    const message = error instanceof Error ? error.message : "Recommendation failed";
    return res.status(status).json({ error: message });
  }
});

app.post("/api/recommend/:guest_id/save", async (req, res) => {
  try {
    const guestId = String(req.params.guest_id ?? "").trim();
    if (!guestId) {
      return res.status(400).json({ error: "Missing guest_id" });
    }

    const payload = req.body as unknown;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Missing recommendation payload" });
    }

    const recommendation = payload as Parameters<typeof saveRecommendationForGuest>[1];
    const saved = await saveRecommendationForGuest(guestId, recommendation);
    return res.json({
      message: "Recommendation saved",
      ...saved,
    });
  } catch (error) {
    const typed = error as Error & { status?: number };
    const status = typeof typed.status === "number" ? typed.status : 500;
    const message = error instanceof Error ? error.message : "Failed to save recommendation";
    return res.status(status).json({ error: message });
  }
});

app.get("/api/recommend/offers", async (_req, res) => {
  try {
    const offers = await listRecommendedOffers();
    return res.json(offers);
  } catch (error) {
    const typed = error as Error & { status?: number };
    const status = typeof typed.status === "number" ? typed.status : 500;
    const message = error instanceof Error ? error.message : "Failed to list offers";
    return res.status(status).json({ error: message });
  }
});

app.patch("/api/recommend/:guest_id/status", async (req, res) => {
  try {
    const guestId = String(req.params.guest_id ?? "").trim();
    if (!guestId) {
      return res.status(400).json({ error: "Missing guest_id" });
    }

    const rawStatus = String((req.body as { status?: string })?.status ?? "").trim();
    const normalizedStatus = rawStatus
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z_]/g, "");

    const statusMap: Record<string, OfferStatus> = {
      en_attente: "en_attente",
      pending: "en_attente",
      generee: "generée",
      generated: "generée",
      envoyee: "envoyée",
      envoyae: "envoyée",
      sent: "envoyée",
      acceptee: "acceptée",
      acceptae: "acceptée",
      accepted: "acceptée",
      refusee: "refusée",
      refusae: "refusée",
      rejected: "refusée",
    };

    const statusInput = statusMap[normalizedStatus];
    if (!statusInput) {
      return res.status(400).json({ error: "Invalid status. Use en_attente | generée | envoyée | acceptée | refusée" });
    }

    const updated = await updateRecommendedOfferStatus(guestId, statusInput);
    return res.json({ message: "Offer status updated", ...updated });
  } catch (error) {
    const typed = error as Error & { status?: number };
    const status = typeof typed.status === "number" ? typed.status : 500;
    const message = error instanceof Error ? error.message : "Failed to update offer status";
    return res.status(status).json({ error: message });
  }
});

app.post("/api/generate-offer/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const tables = await ensureTables();

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    if (!GROQ_API_KEY) {
      return res.status(500).json({ error: "Missing GROQ_API_KEY in backend environment" });
    }

    const servicesRaw = await loadTable(SERVICES_TABLE_KEY, true);
    const services = parseServicesTable(servicesRaw);
    if (!services.length) {
      return res.status(404).json({ error: "No services match your profile yet" });
    }

    const profileResult = buildUserProfile(userId, tables);
    if ("error" in profileResult && typeof profileResult.error === "string") {
      const status = typeof profileResult.status === "number" ? profileResult.status : 400;
      return res.status(status).json({ error: profileResult.error });
    }

    const { user } = profileResult;

    const prompt = `
You have access to 3 SQL table groups:
- Guest KPIs table(s)    -> user behavior KPIs during their trial period
- Users table(s)         -> converted (paying) users
- Partner KPIs table(s)  -> performance metrics per service

Available services:
  - TRAINING_CENTER   — Training & upskilling
  - OPPORTUNITY_ROOM  — Recruitment & hiring
  - PITCH_ROOM        — Startup pitching & investor connection
  - SHOWCASE_ROOM     — Project presentation & visibility

TASK:
Generate a personalized OFFER PACK for a user based on their behavior profile provided below.

You are an AI business assistant specialized in generating personalized service offers for a virtual platform called TalentVerse.

Context:
We have 3 SQL table groups:
1. Guest KPIs tables: contains user behavior KPIs during their trial
2. Users tables: contains converted users
3. Partner KPIs tables: contains services performance

Available services:
${JSON.stringify(services)}

USER PROFILE:
- Domain              : ${user.domain}
- Type                : ${user.domain}
- Session Duration    : ${user.kpis.session_duration ?? 0}
- Interaction Count   : ${user.kpis.interaction_count ?? 0}
- Voice Interaction Time : ${user.kpis.voice_time ?? user.kpis.voice_interaction_time ?? 0}
- Rooms Viewed        : ${user.kpis.rooms_viewed ?? []}
- Most Viewed Room    : ${user.kpis.most_viewed_room ?? "N/A"}
- Navigation Path     : ${user.kpis.navigation_path ?? "N/A"}
- Customization Time  : ${user.kpis.customization_time ?? 0}
- Idle Time           : ${user.kpis.idle_time ?? 0}
- Engagement Score    : ${user.kpis.engagement_score ?? 0}
- Engagement Level    : ${String(user.kpis.engagement_level ?? "").toUpperCase() || "UNKNOWN"}
- Conversion Probability : ${user.kpis.conversion_prob ?? user.kpis.conversion_probability ?? 0}

INSTRUCTIONS:
Step 1 — Identify MAIN INTEREST from KPIs
Use the following rules:
  - High time in TRAINING_CENTER   -> training / upskilling need
  - High time in PITCH_ROOM        -> business development / funding need
  - High time in OPPORTUNITY_ROOM  -> recruitment / talent need
  - High time in SHOWCASE_ROOM     -> visibility / branding need
  - Spread across multiple rooms   -> exploratory profile (offer discovery pack)

Step 2 — Adapt the offer using:
  - Engagement Level:
      HOT  -> premium, high-value offer with urgency framing
      WARM -> balanced offer with clear value proposition
      COLD -> lightweight, low-commitment introductory offer
  - Domain:
      Entreprise  -> focus on ROI, talent, growth, competitive advantage
      Institution -> focus on impact, skill development, partnerships
  - Behavior:
      Focused user (1-2 rooms, high time) -> targeted single-service offer
      Explorer (3-4 rooms, spread time)   -> multi-service discovery pack

Step 3 — Build the PACK
  - Include between 1 and 3 services MAXIMUM
  - Every service MUST come from the available services list above
  - For each service, provide a clear, user-specific justification

Step 4 — Tone
  - Professional, persuasive, and concise
  - Address the user's business reality directly
  - Avoid generic statements — make it feel tailored

OUTPUT FORMAT
Return ONLY a valid JSON object. No explanation outside the JSON.
No markdown code fences. No extra keys.

{
  "main_interest": "<one of: TRAINING | RECRUITMENT | PITCHING | VISIBILITY | EXPLORATION>",
  "recommended_pack": [
    {
      "service": "<SERVICE_NAME_FROM_LIST>",
      "reason": "<1-2 sentence justification tailored to this user>"
    }
  ],
  "offer_message": "<2-3 sentence personalized pitch addressed to the user>",
  "priority": "LOW | MEDIUM | HIGH"
}

PRIORITY MAPPING (for reference)
  Conversion Probability >= 0.75  AND  Engagement Level = HOT   -> HIGH
  Conversion Probability 0.40-0.74  OR  Engagement Level = WARM -> MEDIUM
  Conversion Probability < 0.40  AND  Engagement Level = COLD   -> LOW
`;

    const messages = [
      {
        role: "system" as const,
        content: `You are a TALENTVERSE business assistant.
You ONLY select services from the provided list.
You ALWAYS return valid JSON only.
You NEVER invent services not in the provided list.
You must return exactly these keys: main_interest, recommended_pack, offer_message, priority.
No other keys are allowed.`,
      },
      {
        role: "user" as const,
        content: prompt,
      },
    ];

    const callGroq = async () => {
      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        max_tokens: 2000,
        temperature: 0.6,
        response_format: { type: "json_object" },
      });

      const content = String(response.choices?.[0]?.message?.content ?? "");
      return parsePackResponse(content);
    };

    let generated: GeneratedPackResponse;
    try {
      generated = await callGroq();
    } catch {
      // Auto retry once when JSON parsing fails.
      generated = await callGroq();
    }

    const serviceById = new Map(services.map((service) => [normalizeKey(service.id), service]));
    const serviceByName = new Map(services.map((service) => [normalizeKey(service.name), service]));

    const generatedServices = Array.isArray(generated.recommended_pack)
      ? generated.recommended_pack.map((item) => ({
        id: String(item.service ?? ""),
        name: String(item.service ?? ""),
        reason: String(item.reason ?? "").trim(),
      }))
      : (generated.pack?.services ?? []).map((item) => ({
        id: String(item.id ?? ""),
        name: String(item.name ?? ""),
        reason: String(item.reason ?? "").trim(),
      }));

    const normalizedServices = generatedServices
      .map((item) => {
        const selected = serviceById.get(normalizeKey(item.id)) || serviceByName.get(normalizeKey(item.name));
        if (!selected) return null;
        return {
          id: selected.id,
          name: selected.name,
          price: selected.price,
          reason: String(item.reason ?? "").trim() || "Selected for KPI and domain alignment.",
        };
      })
      .filter((item): item is PackService => item !== null)
      .slice(0, 3);

    if (!normalizedServices.length) {
      return res.status(404).json({ error: "No services match your profile yet" });
    }

    const priority = String(generated.priority ?? "MEDIUM").toUpperCase();
    const mainInterest = String(generated.main_interest ?? "General optimization").trim();
    const offerMessage = String(generated.offer_message ?? "").trim()
      || `A personalized TalentVerse offer for ${user.domain}.`;

    const strictResponse: Pick<GeneratedPackResponse, "main_interest" | "recommended_pack" | "offer_message" | "priority"> = {
      main_interest: mainInterest,
      recommended_pack: normalizedServices.map((service) => ({
        service: service.id,
        reason: service.reason,
      })),
      offer_message: offerMessage,
      priority: (priority === "HIGH" || priority === "MEDIUM" || priority === "LOW")
        ? priority as "HIGH" | "MEDIUM" | "LOW"
        : "MEDIUM",
    };

    return res.json(strictResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown backend error";
    if (message.includes("parse")) {
      return res.status(500).json({ error: "Failed to parse AI response" });
    }
    console.error("Groq endpoint error", message);
    return res.status(500).json({ error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

loadTables().then((tables) => {
  const keys = Object.keys(tables);
  console.log(
    `PostgreSQL tables loaded at startup: ${
      keys.length ? keys.join(", ") : "none"
    }`
  );
}).catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`Database preload failed: ${message}`);
});

export default app;
