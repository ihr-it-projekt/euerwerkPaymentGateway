import { randomBytes } from 'node:crypto';

/** Zufälliges Secret mit Präfix, z.B. `pgw_live_…` oder `whsec_…`. */
export const generateSecret = (prefix: string, bytes = 32): string =>
	`${prefix}_${randomBytes(bytes).toString('base64url')}`;
