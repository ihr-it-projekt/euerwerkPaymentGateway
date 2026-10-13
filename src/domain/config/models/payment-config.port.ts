import type { PaymentConfig } from './payment-config.schema.ts';

/**
 * Quelle der Mandanten-Konfiguration (EÜRwerk).
 * Wirft `UNAUTHORIZED` bei ungültigem/widerrufenem API-Key.
 */
export interface PaymentConfigSource {
	load: (apiKey: string) => Promise<PaymentConfig>;
}
