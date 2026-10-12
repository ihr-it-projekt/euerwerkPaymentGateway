import { faker } from '@faker-js/faker';
import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { buildCheckout } from '#tests/factories/checkout.factory.ts';
import { buildCredentials } from '#tests/factories/merchant.factory.ts';
import { requestLog } from '#tests/mock-server/request-log.ts';
import { createStripeClient } from './stripe-client.ts';
import { createStripeWebhookProcessor } from './stripe-webhook.processor.ts';
import { createStripeProvider } from './stripe.provider.ts';
import { mapStripeEvent } from './map-stripe-event.helper.ts';

const provider = createStripeProvider(createStripeClient);
const webhooks = createStripeWebhookProcessor(createStripeClient);

const stripeEvent = (type: string, session: Record<string, unknown>): Stripe.Event =>
	({ id: 'evt_1', object: 'event', type, data: { object: session } }) as unknown as Stripe.Event;

describe('mapStripeEvent', () => {
	it.each([
		['checkout.session.completed', 'paid', 'SUCCEEDED'],
		['checkout.session.completed', 'no_payment_required', 'SUCCEEDED'],
		['checkout.session.completed', 'unpaid', 'PROCESSING'],
		['checkout.session.async_payment_succeeded', 'paid', 'SUCCEEDED'],
		['checkout.session.async_payment_failed', 'unpaid', 'FAILED'],
		['checkout.session.expired', 'unpaid', 'EXPIRED']
	])('%s (%s) → %s', (type, paymentStatus, expected) => {
		const outcome = mapStripeEvent(
			stripeEvent(type, { id: 'cs_1', payment_status: paymentStatus })
		);

		expect(outcome?.status).toBe(expected);
	});

	it.each([
		['pi_string', 'pi_string'],
		[{ id: 'pi_object' }, 'pi_object'],
		[null, null]
	])('extrahiert payment_intent %j', (paymentIntent, expected) => {
		const outcome = mapStripeEvent(
			stripeEvent('checkout.session.completed', { id: 'cs_1', payment_intent: paymentIntent })
		);

		expect(outcome).toEqual({
			providerReference: 'cs_1',
			status: 'SUCCEEDED',
			providerPaymentId: expected
		});
	});

	it('ignoriert andere Events', () => {
		expect(mapStripeEvent(stripeEvent('invoice.paid', { id: 'in_1' }))).toBeNull();
	});
});

describe('StripeProvider', () => {
	it('erstellt Sessions mit Idempotency-Key, Bruttopreisen und Metadaten', async () => {
		const checkout = buildCheckout({ metadata: { orderId: '42' } });
		const credentials = buildCredentials();

		const session = await provider.createCheckoutSession(checkout, credentials);

		expect(session.redirectUrl).toContain(session.providerReference);
		const [call] = requestLog.find('POST', /\/v1\/checkout\/sessions$/);
		expect(call?.headers.get('idempotency-key')).toBe(`checkout-${checkout.id}`);
		expect(call?.body).toMatchObject({
			customer_email: checkout.customer.email,
			'metadata[orderId]': '42',
			'metadata[checkoutId]': checkout.id,
			'line_items[0][price_data][tax_behavior]': 'inclusive'
		});
	});

	it('wirft PROVIDER_NOT_CONFIGURED ohne Stripe-Credentials', async () => {
		await expect(
			provider.createCheckoutSession(buildCheckout(), buildCredentials({ stripe: undefined }))
		).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
	});

	it('verifiziert Webhook-Signaturen mit dem Secret des Merchants', async () => {
		const credentials = buildCredentials();
		const rawBody = JSON.stringify(
			stripeEvent('checkout.session.expired', { id: `cs_${faker.string.alphanumeric(10)}` })
		);
		const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
			payload: rawBody,
			secret: credentials.stripe!.webhookSecret
		});

		const valid = await webhooks.processWebhook(
			{ rawBody, headers: { 'stripe-signature': signature } },
			credentials
		);

		expect(valid?.status).toBe('EXPIRED');
		await expect(
			webhooks.processWebhook({ rawBody, headers: {} }, credentials)
		).rejects.toMatchObject({
			code: 'INVALID_WEBHOOK_SIGNATURE'
		});
	});
});
