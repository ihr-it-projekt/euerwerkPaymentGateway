import { faker } from '@faker-js/faker';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requestLog } from '../mock-server/request-log.ts';
import { createCheckout, getCheckout, postCheckout } from './support/checkout-api.ts';
import { sendStripeEvent } from './support/provider-webhooks.ts';
import {
	createMerchantViaApi,
	createTestContext,
	testConfig,
	type CreatedTestMerchant,
	type TestContext
} from './support/test-app.ts';

describe('Wero Checkout (über Stripe) – Ende-zu-Ende', () => {
	let ctx: TestContext;
	let merchant: CreatedTestMerchant;

	beforeAll(async () => {
		ctx = await createTestContext();
		merchant = await createMerchantViaApi(ctx.app);
	});

	afterAll(async () => {
		await ctx.close();
	});

	it('legt eine auf Wero eingeschränkte Stripe Checkout Session an', async () => {
		const checkout = await createCheckout(ctx.app, merchant.apiKey, { provider: 'wero' });

		expect(checkout).toMatchObject({ provider: 'wero', status: 'PENDING' });
		expect(checkout.redirectUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
		const [stripeCall] = requestLog.find('POST', /\/v1\/checkout\/sessions$/);
		expect(stripeCall?.body).toMatchObject({
			'allowed_payment_method_types[0]': 'wero',
			client_reference_id: checkout.id
		});
	});

	it('verarbeitet den Stripe-Webhook, verbucht als Überweisung und benachrichtigt den Shop', async () => {
		const checkout = await createCheckout(ctx.app, merchant.apiKey, { provider: 'wero' });
		requestLog.clear();

		const response = await sendStripeEvent(ctx.app, merchant, {
			type: 'checkout.session.completed',
			session: {
				id: checkout.providerReference,
				payment_status: 'paid',
				payment_intent: `pi_${faker.string.alphanumeric(24)}`
			}
		});

		expect(await response.json()).toMatchObject({ result: 'APPLIED' });
		const paid = await getCheckout(ctx.app, merchant.apiKey, checkout.id);
		expect(paid).toMatchObject({
			provider: 'wero',
			status: 'SUCCEEDED',
			accountingStatus: 'BOOKED'
		});
		const [booking] = requestLog.find('POST', /book-amount$/);
		expect(booking?.body).toMatchObject({ paymentMethod: 'BANK_TRANSFER' });
		const [shopCall] = requestLog.find('POST', /payment-gateway\/webhook$/);
		expect(shopCall?.body).toMatchObject({
			type: 'checkout.succeeded',
			data: { id: checkout.id, provider: 'wero' }
		});
	});

	it.each([
		['Nicht-EUR-Währung', { currency: 'USD' }],
		[
			'Betrag unter 0,50 €',
			{ items: [{ name: 'Mini', quantity: 1, unitAmount: 49, taxRate: 19 as const }] }
		]
	])('lehnt %s mit 400 ab, ohne Stripe aufzurufen', async (_label, overrides) => {
		const response = await postCheckout(ctx.app, merchant.apiKey, {
			provider: 'wero',
			...overrides
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
		expect(requestLog.find('POST', /\/v1\/checkout\/sessions$/)).toHaveLength(0);
	});

	it('liefert 422, wenn Wero für den Merchant nicht aktiviert ist', async () => {
		const withoutWero = await createMerchantViaApi(ctx.app, { wero: undefined });

		const response = await postCheckout(ctx.app, withoutWero.apiKey, { provider: 'wero' });

		expect(response.status).toBe(422);
	});

	it('lehnt Merchants mit Wero, aber ohne Stripe-Credentials ab', async () => {
		const response = await ctx.app.request('/v1/admin/merchants', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${testConfig.ADMIN_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				name: faker.company.name(),
				shopWebhookUrl: faker.internet.url(),
				wero: { acquirer: 'stripe' }
			})
		});

		expect(response.status).toBe(400);
		const body = (await response.json()) as { error: { details: { path: string[] }[] } };
		expect(body.error.details[0]?.path).toEqual(['wero']);
	});
});
