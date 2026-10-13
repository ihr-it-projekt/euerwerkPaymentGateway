import { beforeEach, describe, expect, it } from 'vitest';
import { buildCreateCheckoutInput } from '../factories/checkout.factory.ts';
import { euerwerkMock } from '../mock-server/handlers/euerwerk.handlers.ts';
import { stripeMock } from '../mock-server/handlers/stripe.handlers.ts';
import { requestLog } from '../mock-server/request-log.ts';
import { createCheckout, postCheckout, providerRef } from './support/checkout-api.ts';
import { sendStripeEvent } from './support/provider-webhooks.ts';
import {
	authHeaders,
	createTenant,
	createTestApp,
	getWebhookUrls,
	testConfig,
	type TestTenant,
	toPath
} from './support/test-app.ts';

describe('Authentifizierung über den EÜRwerk-API-Key', () => {
	const app = createTestApp();
	let tenant: TestTenant;

	beforeEach(() => {
		tenant = createTenant();
	});

	it('verlangt einen API-Key, ohne EÜRwerk zu fragen', async () => {
		const response = await app.request('/v1/checkouts', { method: 'POST', body: '{}' });

		expect(response.status).toBe(401);
		expect(requestLog.all()).toHaveLength(0);
	});

	it('reicht den Key an EÜRwerk weiter – unbekannte/widerrufene Keys → 401', async () => {
		euerwerkMock.revoke(tenant.apiKey);

		const response = await postCheckout(app, tenant.apiKey);

		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
		expect(requestLog.find('GET', /payment-gateway\/config$/)).toHaveLength(1);
	});

	it('validiert den Request-Body mit Detailangaben', async () => {
		const response = await app.request('/v1/checkouts', {
			method: 'POST',
			headers: authHeaders(tenant.apiKey),
			body: JSON.stringify({ ...buildCreateCheckoutInput(), items: [], successUrl: 'x' })
		});

		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { details: { path: string[] }[] } };
		expect(body.error.details.map((detail) => detail.path.join('.'))).toEqual(
			expect.arrayContaining(['items', 'successUrl'])
		);
	});

	it('liefert 422, wenn der Provider in EÜRwerk nicht konfiguriert ist', async () => {
		const stripeOnly = createTenant({ paypal: null });

		const response = await postCheckout(app, stripeOnly.apiKey, { provider: 'paypal' });

		expect(response.status).toBe(422);
		expect(await response.json()).toMatchObject({ error: { code: 'PROVIDER_NOT_CONFIGURED' } });
	});
});

describe('Mandantentrennung ohne eigene Datenhaltung', () => {
	const app = createTestApp();

	it('fremde Checkouts sind nicht abrufbar (eigene Stripe-Credentials je Mandant)', async () => {
		const owner = createTenant();
		const other = createTenant();
		const checkout = await createCheckout(app, owner.apiKey);

		const foreign = await app.request(`/v1/checkouts/${checkout.id}`, {
			headers: authHeaders(other.apiKey)
		});

		expect(foreign.status).toBe(404);
	});

	it.each(['keine-id', 'klarna.abc', 'stripe.../etc', 'paypal.'])(
		'liefert 404 für ungültige Checkout-ID %s',
		async (id) => {
			const tenant = createTenant();

			const response = await app.request(`/v1/checkouts/${encodeURIComponent(id)}`, {
				headers: authHeaders(tenant.apiKey)
			});

			expect(response.status).toBe(404);
		}
	);
});

describe('Webhook-URLs mit verschlüsseltem Key', () => {
	const app = createTestApp();

	it('liefert URLs nur für konfigurierte Kanäle, ohne den Key im Klartext', async () => {
		const tenant = createTenant({ paypal: null });

		const urls = await getWebhookUrls(app, tenant.apiKey);

		expect(Object.keys(urls)).toEqual(['stripe']);
		expect(urls.stripe).toMatch(
			new RegExp(`^${testConfig.PUBLIC_BASE_URL}/v1/webhooks/stripe/v1\\.`)
		);
		expect(urls.stripe).not.toContain(tenant.apiKey);
	});

	it('lehnt manipulierte Tokens und unbekannte Kanäle mit 404 ab', async () => {
		const tenant = createTenant();
		const { stripe } = await getWebhookUrls(app, tenant.apiKey);
		const tampered = `${toPath(stripe!).slice(0, -2)}xx`;

		const manipulated = await app.request(tampered, { method: 'POST', body: '{}' });
		const unknownSource = await app.request(toPath(stripe!).replace('/stripe/', '/klarna/'), {
			method: 'POST',
			body: '{}'
		});

		expect(manipulated.status).toBe(404);
		expect(unknownSource.status).toBe(404);
	});

	it('Webhooks eines widerrufenen Keys werden mit 401 abgelehnt (Provider wiederholt später)', async () => {
		const tenant = createTenant();
		const checkout = await createCheckout(app, tenant.apiKey);
		const { stripe } = await getWebhookUrls(app, tenant.apiKey);
		euerwerkMock.revoke(tenant.apiKey);

		const response = await sendStripeEvent(app, tenant, {
			webhookUrl: stripe!,
			type: 'checkout.session.completed',
			session: stripeMock.updateSession(providerRef(checkout), { payment_status: 'paid' })
		});

		expect(response.status).toBe(401);
	});
});
