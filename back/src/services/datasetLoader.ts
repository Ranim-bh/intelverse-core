import { Pool } from "pg";
import { queryDb } from "./db.js";

export type DatasetsMap = Record<string, unknown[] | Record<string, unknown>>;

let cache: DatasetsMap | null = null;

const normalizeTableName = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const toSafeIdentifier = (name: string): string => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Unsupported table name '${name}'`);
  }
  return `"${name.replace(/"/g, '""')}"`;
};

interface NormalizedRow {
  [key: string]: unknown;
}

const normalizeRow = (row: Record<string, unknown>): NormalizedRow => {
  const normalized: NormalizedRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      normalized[key] = value.toISOString();
      continue;
    }
    normalized[key] = value;
  }
  return normalized;
};

const getTableNames = async (client: Pool): Promise<string[]> => {
  const result = await queryDb(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type IN ('BASE TABLE', 'VIEW')
    ORDER BY table_name ASC
  `);
  return (result.rows as Array<{ table_name: string }>)
    .map((row) => row.table_name)
    .filter(Boolean);
};

const getConfiguredTables = (): Set<string> | null => {
  const raw = String(
    process.env.TABLES_LIST ?? process.env.DATASET_TABLES ?? ""
  ).trim();
  if (!raw) return null;

  const tables = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!tables.length) return null;
  return new Set(tables);
};

const loadSingleTable = async (
  client: Pool,
  tableName: string
): Promise<NormalizedRow[]> => {
  const safeName = toSafeIdentifier(tableName);
  const result = await queryDb(`SELECT * FROM ${safeName}`);
  return (result.rows as Record<string, unknown>[]).map(normalizeRow);
};

export const loadDatasets = async (
  forceRefresh: boolean = false
): Promise<DatasetsMap> => {
  if (cache && !forceRefresh) return cache;

  const client = new Pool();
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

export const getDatasets = (): DatasetsMap | null => cache;

export const loadDataset = async (
  key: string,
  forceRefresh: boolean = false
): Promise<unknown[] | Record<string, unknown> | undefined> => {
  const datasets = await loadDatasets(forceRefresh);
  return datasets[key];
};
