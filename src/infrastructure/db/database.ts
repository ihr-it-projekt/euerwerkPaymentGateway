import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

/** Gemeinsamer Typ für postgres-js (Produktion) und PGlite (Integrationstests). */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface DatabaseConnection {
	db: Database;
	close: () => Promise<void>;
}

export const connectPostgres = (url: string): DatabaseConnection => {
	const client = postgres(url, { max: 10 });
	return {
		db: drizzle(client, { schema }),
		close: () => client.end()
	};
};
