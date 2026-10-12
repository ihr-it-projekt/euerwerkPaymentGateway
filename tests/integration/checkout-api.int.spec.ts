import { faker } from '@faker-js/faker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCreateCheckoutInput } from '../factories/checkout.factory.ts';
import { createCheckout, postCheckout } from './support/checkout-api.ts';
import {
	authHeaders,
	createMerchantViaApi,
	createTestContext,
	testConfig,
	type CreatedTestMerchant,
	type TestContext
} from './support/test-app.ts';

describe('Checkout-API – Auth, Validierung, Mandantentrennung', () => {
	let ctx: TestContext;
	let merchant: CreatedTestMerchant;

	beforeAll(async () => {
		ctx = await createTestContext();
		merchant = await createMerchantViaApi(ctx.app);
	});

	afterAll(async () => {
		await ctx.close();
	});

	it('verlangt einen gültigen API-Key', async () => {
		const missing = await ctx.app.request('/v1/checkouts', { method: 'POST' });
		const wrong = await postCheckout(ctx.app, 'pgw_falsch');

		expect(missing.status).toBe(401);
		expect(wrong.status).toBe(401);
		expect(await wrong.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
	});

	it('validiert den Request-Body mit Detailangaben', async () => {
		const invalid = { ...buildCreateCheckoutInput(), items: [], successUrl: 'keine-url' };

		const response = await ctx.app.request('/v1/checkouts', {
			method: 'POST',
			headers: authHeaders(merchant.apiKey),
			body: JSON.stringify(invalid)
		});

		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { details: { path: string[] }[] } };
		const paths = body.error.details.map((detail) => detail.path.join('.'));
		expect(paths).toEqual(expect.arrayContaining(['items', 'successUrl']));
	});

	it('lehnt nicht erlaubte Steuersätze ab', async () => {
		const response = await postCheckout(ctx.app, merchant.apiKey, {
			items: [{ name: 'X', quantity: 1, unitAmount: 100, taxRate: 16 as 19 }]
		});

		expect(response.status).toBe(400);
	});

	it('liefert 422, wenn der gewählte Provider nicht konfiguriert ist', async () => {
		const stripeOnly = await createMerchantViaApi(ctx.app, { paypal: undefined });

		const response = await postCheckout(ctx.app, stripeOnly.apiKey, { provider: 'paypal' });

		expect(response.status).toBe(422);
		expect(await response.json()).toMatchObject({ error: { code: 'PROVIDER_NOT_CONFIGURED' } });
	});

	it('trennt Checkouts strikt nach Merchant', async () => {
		const other = await createMerchantViaApi(ctx.app);
		const checkout = await createCheckout(ctx.app, merchant.apiKey);

		const foreign = await ctx.app.request(`/v1/checkouts/${checkout.id}`, {
			headers: authHeaders(other.apiKey)
		});
		const own = await ctx.app.request(`/v1/checkouts/${checkout.id}`, {
			headers: authHeaders(merchant.apiKey)
		});

		expect(foreign.status).toBe(404);
		expect(own.status).toBe(200);
	});

	it('liefert 400 für ungültige Checkout-IDs', async () => {
		const response = await ctx.app.request('/v1/checkouts/keine-uuid', {
			headers: authHeaders(merchant.apiKey)
		});

		expect(response.status).toBe(400);
	});

	it('lehnt Webhooks für unbekannte Merchants oder Provider ab', async () => {
		const unknownMerchant = await ctx.app.request(`/v1/webhooks/stripe/${faker.string.uuid()}`, {
			method: 'POST',
			body: '{}'
		});
		const unknownProvider = await ctx.app.request(`/v1/webhooks/klarna/${merchant.id}`, {
			method: 'POST',
			body: '{}'
		});

		expect(unknownMerchant.status).toBe(404);
		expect(unknownProvider.status).toBe(404);
	});
});

describe('Admin-API', () => {
	let ctx: TestContext;

	beforeAll(async () => {
		ctx = await createTestContext();
	});

	afterAll(async () => {
		await ctx.close();
	});

	it('legt Merchants an und liefert Webhook-URLs für die Provider', async () => {
		const merchant = await createMerchantViaApi(ctx.app);

		expect(merchant.apiKey).toMatch(/^pgw_/);
		expect(merchant.webhookSigningSecret).toMatch(/^whsec_/);
		expect(merchant).toMatchObject({
			providerWebhookUrls: {
				stripe: `${testConfig.PUBLIC_BASE_URL}/v1/webhooks/stripe/${merchant.id}`,
				paypal: `${testConfig.PUBLIC_BASE_URL}/v1/webhooks/paypal/${merchant.id}`
			}
		});
	});

	it('speichert Provider-Credentials verschlüsselt', async () => {
		const merchant = await createMerchantViaApi(ctx.app);

		const rows = await ctx.db.query.merchants.findMany();
		const stored = rows.find((row) => row.id === merchant.id);

		expect(stored?.encryptedCredentials).toMatch(/^v1\./);
		expect(stored?.encryptedCredentials).not.toContain(merchant.input.stripe!.secretKey);
		expect(stored?.apiKeyHash).not.toBe(merchant.apiKey);
	});

	it('verweigert den Zugriff ohne Admin-Key', async () => {
		const response = await ctx.app.request('/v1/admin/merchants', {
			method: 'POST',
			headers: authHeaders('falscher-key'),
			body: '{}'
		});

		expect(response.status).toBe(401);
	});
});
