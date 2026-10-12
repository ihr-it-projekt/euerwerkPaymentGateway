import { randomBytes } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { createApp } from '#src/app.ts';
import { buildDependencies, type GatewayConfig } from '#src/composition-root.ts';
import type { Database } from '#src/infrastructure/db/database.ts';
import * as schema from '#src/infrastructure/db/schema.ts';
import { silentLogger } from '#src/shared/logger/logger.ts';
import { buildCreateMerchantInput } from '../../factories/merchant.factory.ts';
import { EUERWERK_API, PAYPAL_API } from '../../mock-server/constants.ts';
import type { CreateMerchantInput } from '#src/domain/merchant/models/merchant.schema.ts';

export const testConfig: GatewayConfig = {
	ENCRYPTION_KEY: randomBytes(32).toString('base64'),
	ADMIN_API_KEY: randomBytes(32).toString('hex'),
	PUBLIC_BASE_URL: 'http://gateway.test',
	PAYPAL_API_BASE: PAYPAL_API,
	EUERWERK_API_BASE: EUERWERK_API
};

export interface TestContext {
	app: ReturnType<typeof createApp>;
	db: Database;
	close: () => Promise<void>;
}

/**
 * Vollständige App mit echter Postgres-Engine (PGlite, in-process) und allen echten Adaptern.
 * Externe HTTP-Calls laufen gegen den MSW-Mockserver.
 */
export const createTestContext = async (): Promise<TestContext> => {
	const client = new PGlite();
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: 'drizzle' });
	const app = createApp(buildDependencies(testConfig, db, silentLogger));
	return { app, db, close: () => client.close() };
};

export interface CreatedTestMerchant {
	id: string;
	apiKey: string;
	webhookSigningSecret: string;
	input: CreateMerchantInput;
}

export const createMerchantViaApi = async (
	app: TestContext['app'],
	overrides: Partial<CreateMerchantInput> = {}
): Promise<CreatedTestMerchant> => {
	const input = buildCreateMerchantInput(overrides);
	const response = await app.request('/v1/admin/merchants', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${testConfig.ADMIN_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(input)
	});
	if (response.status !== 201) {
		throw new Error(`Merchant-Anlage fehlgeschlagen: ${response.status} ${await response.text()}`);
	}
	const body = (await response.json()) as Omit<CreatedTestMerchant, 'input'>;
	return { ...body, input };
};

export const authHeaders = (apiKey: string): Record<string, string> => ({
	Authorization: `Bearer ${apiKey}`,
	'Content-Type': 'application/json'
});
