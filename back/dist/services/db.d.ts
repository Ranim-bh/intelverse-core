import { Pool, type QueryResult, type QueryResultRow } from "pg";
export declare const getDbPool: () => Pool;
export declare const queryDb: <T extends QueryResultRow>(sql: string, params?: unknown[]) => Promise<QueryResult<T>>;
//# sourceMappingURL=db.d.ts.map