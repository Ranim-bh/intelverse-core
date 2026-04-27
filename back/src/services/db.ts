import { Pool, type QueryResult, type QueryResultRow } from "pg";

let pool: Pool | null = null;

interface PoolConfig {
  connectionString?: string;
  host?: string;
  user?: string;
  password?: string;
  database?: string;
  port?: number;
  ssl?: boolean | { rejectUnauthorized: boolean };
}

const buildPoolConfig = (): PoolConfig => {
  const databaseUrl = (process.env.DATABASE_URL ?? "").trim();

  if (databaseUrl) {
    return {
      connectionString: databaseUrl,
      ssl:
        (process.env.PG_SSL ?? "false").toLowerCase() === "true"
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
    ssl:
      (process.env.PG_SSL ?? "false").toLowerCase() === "true"
        ? { rejectUnauthorized: false }
        : false,
  };
};

export const getDbPool = (): Pool => {
  if (pool) return pool;
  pool = new Pool(buildPoolConfig());
  return pool;
};

export const queryDb = async <T extends QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<QueryResult<T>> => {
  const db = getDbPool();
  return db.query<T>(sql, params);
};
