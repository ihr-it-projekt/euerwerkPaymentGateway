import { beforeEach, describe, expect, it } from 'vitest';
import { stripeMock } from '../mock-server/handlers/stripe.handlers.ts';
import { requestLog } from '../mock-server/request-log.ts';
import { createCheckout, getCheckout, postCheckout, providerRef } from './support/checkout-api.ts';
import { sendStripeEvent } from './support/provider-webhooks.ts';
import {
	createTenant,
	createTestApp,
	getWebhookUrls,
	type TestTenant
} from './support/test-app.ts';

describe('Wero (über Stripe) – zustandsloser Ablauf', () => {
	const app = createTestApp();
	let tenant: TestTenant;

	beforeEach(() => {
		tenant = createTenant();
	});

	it('legt eine auf Wero eingeschränkte Stripe-Session an', async () => {
		const checkout = await createCheckout(app, tenant.apiKey, { provider: 'wero' });

		expect(checkout.id).toMatch(/^wero\.cs_test_/);
		expect(requestLog.find('POST', /\/v1\/checkout\/sessions$/)[0]?.body).toMatchObject({
			'allowed_payment_method_types[0]': 'wero',
			'metadata[pgw_provider]': 'wero'
		});
		expect((await getCheckout(app, tenant.apiKey, checkout.id)).provider).toBe('wero');
	});

	it('bucht über den Stripe-Webhook mit Zahlungsart WERO', async () => {
		const checkout = await createCheckout(app, tenant.apiKey, { provider: 'wero' });
		const { stripe: webhookUrl } = await getWebhookUrls(app, tenant.apiKey);

		const response = await sendStripeEvent(app, tenant, {
			webhookUrl: webhookUrl!,
			type: 'checkout.session.completed',
			session: stripeMock.updateSession(providerRef(checkout), {
				status: 'complete',
				payment_status: 'paid'
			})
		});

		expect(await response.json()).toMatchObject({ result: 'BOOKED' });
		expect(requestLog.find('POST', /book-amount$/)[0]?.body).toMatchObject({
			paymentMethod: 'WERO'
		});
	});

	it('Stripe-Checkout-IDs sind nicht als Wero abrufbar und umgekehrt', async () => {
		const checkout = await createCheckout(app, tenant.apiKey, { provider: 'stripe' });

		const response = await app.request(`/v1/checkouts/wero.${providerRef(checkout)}`, {
			headers: { Authorization: `Bearer ${tenant.apiKey}` }
		});

		expect(response.status).toBe(404);
	});

	it.each([
		['Nicht-EUR-Währung', { currency: 'USD' }],
		[
			'Betrag unter 0,50 €',
			{ items: [{ name: 'Mini', quantity: 1, unitAmount: 49, taxRate: 19 as const }] }
		]
	])('lehnt %s mit 400 ab, ohne Stripe oder EÜRwerk-Kontakt', async (_label, overrides) => {
		const response = await postCheckout(app, tenant.apiKey, { provider: 'wero', ...overrides });

		expect(response.status).toBe(400);
		expect(requestLog.find('POST', /\/v1\/checkout\/sessions$/)).toHaveLength(0);
		expect(requestLog.find('POST', /\/contacts$/)).toHaveLength(0);
	});

	it('liefert 422, wenn Wero in EÜRwerk nicht aktiviert ist', async () => {
		const withoutWero = createTenant({ wero: null });

		const response = await postCheckout(app, withoutWero.apiKey, { provider: 'wero' });

		expect(response.status).toBe(422);
	});
});
