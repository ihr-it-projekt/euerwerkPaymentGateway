import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { buildCheckoutRequest, buildLineItem } from '#tests/factories/checkout.factory.ts';
import { buildPaymentConfig } from '#tests/factories/config.factory.ts';
import { stripeMock } from '#tests/mock-server/handlers/stripe.handlers.ts';
import { requestLog } from '#tests/mock-server/request-log.ts';
import { mapStripeEvent } from './map-stripe-event.helper.ts';
import { createStripeClient } from './stripe-client.ts';
import { createStripeWebhookProcessor } from './stripe-webhook.processor.ts';
import { createStripeProvider } from './stripe.provider.ts';
import { toCheckoutStatus } from './to-checkout-status.helper.ts';

const provider = createStripeProvider(createStripeClient);
const webhooks = createStripeWebhookProcessor(createStripeClient);

const asEvent = (type: string, session: Record<string, unknown>): Stripe.Event =>
	({ id: 'evt_1', object: 'event', type, data: { object: session } }) as unknown as Stripe.Event;

const asSession = (fields: Record<string, unknown>): Stripe.Checkout.Session =>
	fields as unknown as Stripe.Checkout.Session;

const signedRequest = async (secret: string, event: Stripe.Event) => {
	const rawBody = JSON.stringify(event);
	const signature = await Stripe.webhooks.generateTestHeaderStringAsync({
		payload: rawBody,
		secret
	});
	return { rawBody, headers: { 'stripe-signature': signature } };
};

describe('mapStripeEvent', () => {
	it.each([
		['checkout.session.completed', 'paid', 'SUCCEEDED'],
		['checkout.session.completed', 'unpaid', 'PROCESSING'],
		['checkout.session.async_payment_succeeded', 'paid', 'SUCCEEDED'],
		['checkout.session.async_payment_failed', 'unpaid', 'FAILED'],
		['checkout.session.expired', 'unpaid', 'EXPIRED']
	])('%s (%s) → %s', (type, paymentStatus, expected) => {
		const mapped = mapStripeEvent(asEvent(type, { id: 'cs_1', payment_status: paymentStatus }));

		expect(mapped?.status).toBe(expected);
	});

	it('ignoriert andere Events', () => {
		expect(mapStripeEvent(asEvent('invoice.paid', { id: 'in_1' }))).toBeNull();
	});
});

describe('toCheckoutStatus', () => {
	it.each([
		[{ status: 'open', payment_status: 'unpaid' }, 'PENDING'],
		[{ status: 'complete', payment_status: 'paid' }, 'SUCCEEDED'],
		[{ status: 'complete', payment_status: 'no_payment_required' }, 'SUCCEEDED'],
		[{ status: 'complete', payment_status: 'unpaid' }, 'PROCESSING'],
		[{ status: 'expired', payment_status: 'unpaid' }, 'EXPIRED'],
		[{ status: null, payment_status: 'unpaid' }, 'PENDING']
	])('%j → %s', (session, expected) => {
		expect(toCheckoutStatus(asSession(session))).toBe(expected);
	});
});

describe('StripeProvider', () => {
	it('legt Sessions idempotent an: gleicher Request → gleicher Idempotency-Key', async () => {
		const config = buildPaymentConfig();
		const checkout = buildCheckoutRequest({ metadata: { orderId: '42' } });

		await provider.createCheckoutSession(checkout, config);
		await provider.createCheckoutSession(checkout, config);

		const [first, second] = requestLog.find('POST', /\/v1\/checkout\/sessions$/);
		expect(first?.headers.get('idempotency-key')).toMatch(/^pgw-[0-9a-f]{64}$/);
		expect(second?.headers.get('idempotency-key')).toBe(first?.headers.get('idempotency-key'));
		expect(first?.body).toMatchObject({
			customer_email: checkout.customer.email,
			'metadata[orderId]': '42',
			'metadata[pgw_contact_id]': checkout.contactId,
			'line_items[0][price_data][tax_behavior]': 'inclusive'
		});
	});

	it('liefert NOT_FOUND für unbekannte oder fremde Sessions', async () => {
		await expect(
			provider.getCheckout('cs_test_unbekannt', buildPaymentConfig())
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('wirft PROVIDER_NOT_CONFIGURED ohne Stripe-Credentials', async () => {
		await expect(
			provider.createCheckoutSession(buildCheckoutRequest(), buildPaymentConfig({ stripe: null }))
		).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
	});
});

describe('StripeWebhookProcessor', () => {
	it('lädt bei Zahlungserfolg Positionen samt Steuersatz für die Buchung nach', async () => {
		const config = buildPaymentConfig();
		const checkout = buildCheckoutRequest({
			reference: 'ORDER-1',
			items: [buildLineItem({ name: 'A', quantity: 2, unitAmount: 1070, taxRate: 7 })]
		});
		const { providerReference } = await provider.createCheckoutSession(checkout, config);
		const session = stripeMock.updateSession(providerReference, {
			status: 'complete',
			payment_status: 'paid',
			payment_intent: { id: 'pi_obj' }
		});
		const event = asEvent('checkout.session.completed', session);

		const outcome = await webhooks.processWebhook(
			await signedRequest(config.stripe!.webhookSecret, event),
			config
		);

		expect(outcome).toMatchObject({
			status: 'SUCCEEDED',
			payment: {
				checkoutId: `stripe.${providerReference}`,
				reference: 'ORDER-1',
				contactId: checkout.contactId,
				amountTotal: 2140,
				providerPaymentId: 'pi_obj',
				items: [{ name: 'A', quantity: 2, unitAmount: 1070, taxRate: 7 }]
			}
		});
	});

	it('ignoriert Sessions ohne Gateway-Metadaten und lehnt falsche Signaturen ab', async () => {
		const config = buildPaymentConfig();
		const foreign = asEvent('checkout.session.completed', { id: 'cs_x', payment_status: 'paid' });
		const request = await signedRequest(config.stripe!.webhookSecret, foreign);

		expect(await webhooks.processWebhook(request, config)).toBeNull();
		await expect(
			webhooks.processWebhook({ rawBody: request.rawBody, headers: {} }, config)
		).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_SIGNATURE' });
	});
});
