import { faker } from '@faker-js/faker';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkouts } from '#src/infrastructure/db/schema.ts';
import { verifyWebhookSignature } from '#src/shared/crypto/verify-webhook-signature.helper.ts';
import type { ShopEvent } from '#src/domain/notification/models/shop-notifier.port.ts';
import { stripeErrorHandler } from '../mock-server/handlers/stripe.handlers.ts';
import { requestLog } from '../mock-server/request-log.ts';
import { mockServer } from '../mock-server/server.ts';
import { createCheckout, getCheckout, postCheckout } from './support/checkout-api.ts';
import { sendStripeEvent } from './support/provider-webhooks.ts';
import {
	createMerchantViaApi,
	createTestContext,
	type CreatedTestMerchant,
	type TestContext
} from './support/test-app.ts';

describe('Stripe Checkout – Ende-zu-Ende', () => {
	let ctx: TestContext;
	let merchant: CreatedTestMerchant;

	beforeAll(async () => {
		ctx = await createTestContext();
		merchant = await createMerchantViaApi(ctx.app);
	});

	afterAll(async () => {
		await ctx.close();
	});

	it('legt eine Stripe Checkout Session an und liefert die Redirect-URL', async () => {
		const checkout = await createCheckout(ctx.app, merchant.apiKey, {
			provider: 'stripe',
			items: [{ name: 'Lizenz', quantity: 2, unitAmount: 1190, taxRate: 19 }]
		});

		expect(checkout).toMatchObject({
			status: 'PENDING',
			amountTotal: 2380,
			accountingStatus: 'PENDING'
		});
		expect(checkout.redirectUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
		const [stripeCall] = requestLog.find('POST', /\/v1\/checkout\/sessions$/);
		expect(stripeCall?.headers.get('authorization')).toBe(
			`Bearer ${merchant.input.stripe!.secretKey}`
		);
		expect(stripeCall?.body).toMatchObject({
			mode: 'payment',
			client_reference_id: checkout.id,
			'line_items[0][quantity]': '2',
			'line_items[0][price_data][unit_amount]': '1190',
			'line_items[0][price_data][currency]': 'eur'
		});
	});

	it('verbucht nach checkout.session.completed in EÜRwerk und benachrichtigt den Shop signiert', async () => {
		const checkout = await createCheckout(ctx.app, merchant.apiKey, { provider: 'stripe' });
		requestLog.clear();
		const paymentIntent = `pi_${faker.string.alphanumeric(24)}`;

		const response = await sendStripeEvent(ctx.app, merchant, {
			type: 'checkout.session.completed',
			session: {
				id: checkout.providerReference,
				payment_status: 'paid',
				payment_intent: paymentIntent
			}
		});

		expect(response.status).toBe(200);
		const updated = await getCheckout(ctx.app, merchant.apiKey, checkout.id);
		expect(updated).toMatchObject({
			status: 'SUCCEEDED',
			providerPaymentId: paymentIntent,
			accountingStatus: 'BOOKED'
		});
		const euerwerkPaths = requestLog
			.all()
			.filter((entry) => entry.url.host === 'euerwerk.test')
			.map((entry) => entry.url.pathname.replace(/[0-9a-f-]{36}/, ':id'));
		expect(euerwerkPaths).toEqual([
			'/api/v1/contacts',
			'/api/v1/invoices',
			'/api/v1/invoices/:id/enshrine',
			'/api/v1/invoices/:id/book-amount'
		]);
		const [booking] = requestLog.find('POST', /book-amount$/);
		expect(booking?.body).toMatchObject({
			amount: checkout.amountTotal / 100,
			paymentMethod: 'CREDIT_CARD'
		});

		const [shopCall] = requestLog.find('POST', /payment-gateway\/webhook$/);
		const event = shopCall?.body as ShopEvent;
		expect(event).toMatchObject({ type: 'checkout.succeeded', data: { id: checkout.id } });
		expect(
			verifyWebhookSignature({
				secret: merchant.webhookSigningSecret,
				body: JSON.stringify(event),
				header: shopCall?.headers.get('x-gateway-signature') ?? '',
				nowSeconds: Math.floor(Date.now() / 1000)
			})
		).toBe(true);
	});

	it('ist idempotent bei doppelt zugestellten Webhooks', async () => {
		const checkout = await createCheckout(ctx.app, merchant.apiKey, { provider: 'stripe' });
		const event = {
			type: 'checkout.session.completed',
			session: { id: checkout.providerReference, payment_status: 'paid' }
		};

		await sendStripeEvent(ctx.app, merchant, event);
		requestLog.clear();
		const second = await sendStripeEvent(ctx.app, merchant, event);

		expect(await second.json()).toMatchObject({ result: 'IGNORED_DUPLICATE' });
		expect(requestLog.all()).toHaveLength(0);
	});

	it('setzt asynchrone Zahlungen erst auf PROCESSING, dann auf FAILED', async () => {
		const checkout = await createCheckout(ctx.app, merchant.apiKey, { provider: 'stripe' });
		const session = { id: checkout.providerReference, payment_status: 'unpaid' };

		await sendStripeEvent(ctx.app, merchant, { type: 'checkout.session.completed', session });
		expect((await getCheckout(ctx.app, merchant.apiKey, checkout.id)).status).toBe('PROCESSING');

		await sendStripeEvent(ctx.app, merchant, {
			type: 'checkout.session.async_payment_failed',
			session
		});
		const failed = await getCheckout(ctx.app, merchant.apiKey, checkout.id);
		expect(failed).toMatchObject({ status: 'FAILED', accountingStatus: 'PENDING' });
		expect(requestLog.find('POST', /\/invoices$/)).toHaveLength(0);
	});

	it('lehnt Webhooks mit falscher Signatur ab', async () => {
		const checkout = await createCheckout(ctx.app, merchant.apiKey, { provider: 'stripe' });

		const response = await sendStripeEvent(ctx.app, merchant, {
			type: 'checkout.session.completed',
			session: { id: checkout.providerReference, payment_status: 'paid' },
			signatureSecret: 'whsec_falsch'
		});

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: { code: 'INVALID_WEBHOOK_SIGNATURE' } });
		expect((await getCheckout(ctx.app, merchant.apiKey, checkout.id)).status).toBe('PENDING');
	});

	it('ignoriert irrelevante Event-Typen', async () => {
		const response = await sendStripeEvent(ctx.app, merchant, {
			type: 'customer.created',
			session: { id: 'cus_123' }
		});

		expect(await response.json()).toMatchObject({ result: 'IGNORED_EVENT' });
	});

	it('meldet 502 und markiert den Checkout als FAILED, wenn Stripe nicht erreichbar ist', async () => {
		mockServer.use(stripeErrorHandler(400));
		const reference = faker.string.alphanumeric(16);

		const response = await postCheckout(ctx.app, merchant.apiKey, {
			provider: 'stripe',
			reference
		});

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({ error: { code: 'UPSTREAM_ERROR' } });
		const [stored] = await ctx.db
			.select()
			.from(checkouts)
			.where(eq(checkouts.reference, reference));
		expect(stored?.status).toBe('FAILED');
	});
});
