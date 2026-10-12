import { createHash } from 'node:crypto';

/** API-Keys werden nur als SHA-256-Hash gespeichert (hohe Entropie → kein Salt nötig). */
export const hashApiKey = (apiKey: string): string =>
	createHash('sha256').update(apiKey).digest('hex');
