import { Pool, type PoolConfig } from "pg";

type DatasetValue = unknown[] | Record<string, unknown>;
export type DatasetsMap = Record<string, DatasetValue>;

let cache: DatasetsMap | null = null;
let pool: Pool | null = null;

const normalizeTableName = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const buildPoolConfig = (): PoolConfig => {
  const databaseUrl = (process.env.DATABASE_URL ?? "").trim();

  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      ssl: (process.env.PG_SSL ?? "false").toLowerCase() === "true"
        ? { rejectUnauthorized: false }
        : false,
    };
  }

  const host = (process.env.PGHOST ?? "").trim();
  const user = (process.env.PGUSER ?? "").trim();
  const password = process.env.PGPASSWORD ?? "";
  const database = (process.env.PGDATABASE ?? "").trim();
  const port = Number(process.env.PGPORT ?? 5432);

  if (!host || !user || !database) {
    throw new Error(
      "Missing PostgreSQL configuration. Set DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT in back/.env"
    );
  }

  return {
    host,
    user,
    password,
    database,
    port: Number.isFinite(port) ? port : 5432,
    ssl: (process.env.PG_SSL ?? "false").toLowerCase() === "true"
      ? { rejectUnauthorized: false }
      : false,
  };
};

const ensurePool = () => {
  if (pool) return pool;
  pool = new Pool(buildPoolConfig());
  return pool;
};

const toSafeIdentifier = (name: string) => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Unsupported table name '${name}'`);
  }
  return `"${name.replace(/"/g, '""')}"`;
};

const normalizeRow = (row: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      normalized[key] = value.toISOString();
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
};

const getTableNames = async (client: Pool) => {
  const result = await client.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type IN ('BASE TABLE', 'VIEW')
    ORDER BY table_name ASC
  `);
  return result.rows.map((row) => row.table_name).filter(Boolean);
};

const getConfiguredTables = () => {
  const raw = String(process.env.TABLES_LIST ?? process.env.DATASET_TABLES ?? "").trim();
  if (!raw) return null;

  const tables = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!tables.length) return null;
  return new Set(tables);
};

const loadSingleTable = async (client: Pool, tableName: string): Promise<DatasetValue> => {
  const safeName = toSafeIdentifier(tableName);
  const result = await client.query<Record<string, unknown>>(`SELECT * FROM ${safeName}`);
  return result.rows.map(normalizeRow);
};

export const loadDatasets = async (forceRefresh = false): Promise<DatasetsMap> => {
  if (cache && !forceRefresh) return cache;

  const client = ensurePool();
  const tableNames = await getTableNames(client);
  const allowedTables = getConfiguredTables();

  const loaded: DatasetsMap = {};

  for (const tableName of tableNames) {
    if (allowedTables && !allowedTables.has(tableName.toLowerCase())) {
      continue;
    }

    const key = normalizeTableName(tableName);
    if (!key) continue;

    try {
      loaded[key] = await loadSingleTable(client, tableName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to load table ${tableName}: ${message}`);
    }
  }

  cache = loaded;
  return cache;
};

export const getDatasets = () => cache;

export const loadDataset = async (key: string, forceRefresh = false): Promise<DatasetValue | undefined> => {
  const datasets = await loadDatasets(forceRefresh);
  return datasets[key];
};
