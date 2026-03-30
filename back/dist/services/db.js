import { Pool } from "pg";
let pool = null;
const buildPoolConfig = () => {
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
        throw new Error("Missing PostgreSQL configuration. Set DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT in back/.env");
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
export const getDbPool = () => {
    if (pool)
        return pool;
    pool = new Pool(buildPoolConfig());
    return pool;
};
export const queryDb = async (sql, params = []) => {
    const db = getDbPool();
    return db.query(sql, params);
};
//# sourceMappingURL=db.js.map