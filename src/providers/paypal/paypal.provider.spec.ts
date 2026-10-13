import { describe, expect, it } from 'vitest';
import { buildCheckoutRequest, buildLineItem } from '#tests/factories/checkout.factory.ts';
import { buildPaymentConfig } from '#tests/factories/config.factory.ts';
import { PAYPAL_API, PAYPAL_INVALID_SIGNATURE } from '#tests/mock-server/constants.ts';
import { paypalMock } from '#tests/mock-server/handlers/paypal.handlers.ts';
import { requestLog } from '#tests/mock-server/request-log.ts';
import { createPayPalApiClient } from './paypal-api.client.ts';
import { contactIdFromCustomId, taxRateFromSku, toTaxSku } from './paypal-metadata.ts';
import { createPayPalProvider, createPayPalWebhookProcessor } from './paypal.provider.ts';
import { toOrderStatus } from './to-order-status.helper.ts';

const api = createPayPalApiClient(PAYPAL_API);
const provider = createPayPalProvider(api);
const webhooks = createPayPalWebhookProcessor(api);

const webhook = (body: unknown, signature = 'valid') => ({
	rawBody: typeof body === 'string' ? body : JSON.stringify(body),
	headers: { 'paypal-transmission-sig': signature, 'paypal-transmission-id': 'tid' }
});

const captureEvent = (eventType: string, orderId: string) => ({
	id: 'WH-1',
	event_type: eventType,
	resource: { supplementary_data: { related_ids: { order_id: orderId } } }
});

describe('PayPal-Metadaten & Status', () => {
	it('kodiert Kontakt und Steuersatz verlustfrei in der Order', () => {
		expect(contactIdFromCustomId('pgw:abc')).toBe('abc');
		expect(contactIdFromCustomId('fremd')).toBeNull();
		expect(contactIdFromCustomId(undefined)).toBeNull();
		expect(taxRateFromSku(toTaxSku(7))).toBe(7);
		expect(() => taxRateFromSku('pgw-tax-16')).toThrow();
	});

	it.each([
		['PAYER_ACTION_REQUIRED', null, 'PENDING'],
		['APPROVED', null, 'PROCESSING'],
		['VOIDED', null, 'FAILED'],
		['COMPLETED', 'COMPLETED', 'SUCCEEDED'],
		['COMPLETED', 'PENDING', 'PROCESSING'],
		['COMPLETED', 'DECLINED', 'FAILED'],
		['UNBEKANNT', null, 'PROCESSING']
	])('%s / Capture %s → %s', (order, capture, expected) => {
		expect(toOrderStatus(order, capture)).toBe(expected);
	});
});

describe('PayPalProvider', () => {
	it('holt ein Token per Client-Credentials und legt die Order idempotent an', async () => {
		const config = buildPaymentConfig();
		const checkout = buildCheckoutRequest({
			items: [buildLineItem({ description: 'x'.repeat(200) })]
		});

		const session = await provider.createCheckoutSession(checkout, config);

		const [tokenCall] = requestLog.find('POST', /\/v1\/oauth2\/token$/);
		const basic = Buffer.from(`${config.paypal!.clientId}:${config.paypal!.clientSecret}`);
		expect(tokenCall?.headers.get('authorization')).toBe(`Basic ${basic.toString('base64')}`);
		const [orderCall] = requestLog.find('POST', /\/v2\/checkout\/orders$/);
		expect(orderCall?.headers.get('paypal-request-id')).toMatch(/^pgw-[0-9a-f]{64}$/);
		expect(session.redirectUrl).toContain(`token=${session.providerReference}`);
	});

	it('liefert NOT_FOUND für fremde Orders und ungültige Order-IDs', async () => {
		const config = buildPaymentConfig();
		const foreign = paypalMock.seedForeignOrder(config.paypal!.clientId);

		await expect(provider.getCheckout(foreign, config)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
		await expect(provider.getCheckout('../evil', config)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
});

describe('PayPalWebhookProcessor', () => {
	it('übergibt alle Transmission-Header an die Verifikation', async () => {
		const config = buildPaymentConfig();
		const event = { id: 'WH-1', event_type: 'CUSTOMER.UPDATED', resource: {} };

		await webhooks.processWebhook(webhook(event), config);

		expect(requestLog.find('POST', /verify-webhook-signature$/)[0]?.body).toMatchObject({
			transmission_id: 'tid',
			transmission_sig: 'valid',
			auth_algo: '',
			webhook_id: config.paypal!.webhookId,
			webhook_event: { id: 'WH-1' }
		});
	});

	it('meldet nichts für noch offene Orders', async () => {
		const config = buildPaymentConfig();
		const { providerReference } = await provider.createCheckoutSession(
			buildCheckoutRequest(),
			config
		);

		const outcome = await webhooks.processWebhook(
			webhook(captureEvent('PAYMENT.CAPTURE.PENDING', providerReference)),
			config
		);

		expect(outcome).toBeNull();
	});

	it.each([
		[
			'ungültige Signatur',
			webhook({ id: 'WH', event_type: 'X', resource: {} }, PAYPAL_INVALID_SIGNATURE)
		],
		['kein JSON', webhook('<xml/>')]
	])('wirft INVALID_WEBHOOK_SIGNATURE: %s', async (_label, request) => {
		await expect(webhooks.processWebhook(request, buildPaymentConfig())).rejects.toMatchObject({
			code: 'INVALID_WEBHOOK_SIGNATURE'
		});
	});
});
