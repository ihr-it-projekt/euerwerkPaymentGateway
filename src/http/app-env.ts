import type { Merchant } from '../domain/merchant/models/merchant.schema.ts';

/** Hono-Kontext: von der Auth-Middleware gesetzter Merchant. */
export interface AppEnv {
	Variables: {
		merchant: Merchant;
	};
}
