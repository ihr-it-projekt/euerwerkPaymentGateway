/** Hono-Kontext: EÜRwerk-API-Key des Shops (von der Middleware aus `Authorization` gelesen). */
export interface AppEnv {
	Variables: {
		apiKey: string;
	};
}
