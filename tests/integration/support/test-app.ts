import { randomBytes } from 'node:crypto';
import { createApp } from '#src/app.ts';
import { buildDependencies, type GatewayConfig } from '#src/composition-root.ts';
import type { PaymentConfig } from '#src/domain/config/models/payment-config.schema.ts';
import { silentLogger } from '#src/shared/logger/logger.ts';
import { buildPaymentConfig } from '../../factories/config.factory.ts';
import { euerwerkMock } from '../../mock-server/handlers/euerwerk.handlers.ts';
import { EUERWERK_API, PAYPAL_API } from '../../mock-server/constants.ts';

export const testConfig: GatewayConfig = {
	ENCRYPTION_KEY: randomBytes(32).toString('base64'),
	PUBLIC_BASE_URL: 'http://gateway.test',
	PAYPAL_API_BASE: PAYPAL_API,
	EUERWERK_API_BASE: EUERWERK_API
};

export type TestApp = ReturnType<typeof createApp>;

/** Komplette App mit allen echten Adaptern – ohne Datenbank, alle HTTP-Calls gegen MSW. */
export const createTestApp = (): TestApp => createApp(buildDependencies(testConfig, silentLogger));

export interface TestTenant {
	apiKey: string;
	config: PaymentConfig;
}

/** EÜRwerk-Mandant im Mock anlegen (API-Key + Zahlungs-Konfiguration). */
export const createTenant = (overrides: Partial<PaymentConfig> = {}): TestTenant => {
	const config = buildPaymentConfig(overrides);
	return { apiKey: euerwerkMock.registerTenant(config), config };
};

export const authHeaders = (apiKey: string): Record<string, string> => ({
	Authorization: `Bearer ${apiKey}`,
	'Content-Type': 'application/json'
});

export const getWebhookUrls = async (
	app: TestApp,
	apiKey: string
): Promise<Record<string, string>> => {
	const response = await app.request('/v1/webhook-endpoints', { headers: authHeaders(apiKey) });
	return (await response.json()) as Record<string, string>;
};

/** Absolute Webhook-URL → Pfad für `app.request`. */
export const toPath = (url: string): string => new URL(url).pathname;
