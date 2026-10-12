import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildCheckout, buildLineItem } from '#tests/factories/checkout.factory.ts';
import { buildCredentials } from '#tests/factories/merchant.factory.ts';
import { PAYPAL_API, PAYPAL_INVALID_SIGNATURE } from '#tests/mock-server/constants.ts';
import { requestLog } from '#tests/mock-server/request-log.ts';
import { mockServer } from '#tests/mock-server/server.ts';
import { createPayPalApiClient } from './paypal-api.client.ts';
import { createPayPalProvider, createPayPalWebhookProcessor } from './paypal.provider.ts';
import { toCaptureStatus } from './to-capture-status.helper.ts';

const api = createPayPalApiClient(PAYPAL_API);
const provider = createPayPalProvider(api);
const webhooks = createPayPalWebhookProcessor(api);

const webhook = (body: unknown, signature = 'valid') => ({
	rawBody: typeof body === 'string' ? body : JSON.stringify(body),
	headers: { 'paypal-transmission-sig': signature, 'paypal-transmission-id': 'tid' }
});

describe('toCaptureStatus', () => {
	it.each([
		['COMPLETED', 'SUCCEEDED'],
		['PENDING', 'PROCESSING'],
		['DECLINED', 'FAILED'],
		['FAILED', 'FAILED'],
		['IRGENDWAS', 'PROCESSING']
	])('%s → %s', (status, expected) => {
		expect(toCaptureStatus(status)).toBe(expected);
	});
});

describe('PayPalProvider.createCheckoutSession', () => {
	it('holt ein Token per Client-Credentials und legt die Order an', async () => {
		const credentials = buildCredentials();
		const checkout = buildCheckout({
			items: [buildLineItem({ quantity: 2, unitAmount: 1050, description: 'x' })]
		});

		const session = await provider.createCheckoutSession(checkout, credentials);

		const [tokenCall] = requestLog.find('POST', /\/v1\/oauth2\/token$/);
		const basic = Buffer.from(
			`${credentials.paypal!.clientId}:${credentials.paypal!.clientSecret}`
		);
		expect(tokenCall?.headers.get('authorization')).toBe(`Basic ${basic.toString('base64')}`);
		expect(tokenCall?.body).toEqual({ grant_type: 'client_credentials' });
		expect(session.providerReference).toEqual(expect.any(String));
		expect(session.redirectUrl).toContain(`token=${session.providerReference}`);
	});

	it('wirft UPSTREAM_ERROR ohne Freigabe-Link', async () => {
		mockServer.use(
			http.post(`${PAYPAL_API}/v2/checkout/orders`, () =>
				HttpResponse.json({ id: 'O1', status: 'CREATED', links: [] })
			)
		);

		await expect(
			provider.createCheckoutSession(buildCheckout(), buildCredentials())
		).rejects.toMatchObject({
			code: 'UPSTREAM_ERROR'
		});
	});

	it('wirft PROVIDER_NOT_CONFIGURED ohne PayPal-Credentials', async () => {
		await expect(
			provider.createCheckoutSession(buildCheckout(), buildCredentials({ paypal: undefined }))
		).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
	});
});

describe('PayPalProvider.processWebhook', () => {
	const credentials = buildCredentials();

	it('captured bei CHECKOUT.ORDER.APPROVED', async () => {
		const outcome = await webhooks.processWebhook(
			webhook({ id: 'WH-1', event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 'ORDER-1' } }),
			credentials
		);

		expect(outcome).toMatchObject({ providerReference: 'ORDER-1', status: 'SUCCEEDED' });
		const [capture] = requestLog.find('POST', /ORDER-1\/capture$/);
		expect(capture?.headers.get('paypal-request-id')).toBe('capture-ORDER-1');
	});

	it('übergibt alle Transmission-Header an die Verifikation', async () => {
		await webhooks.processWebhook(
			webhook({ id: 'WH-1', event_type: 'CUSTOMER.UPDATED', resource: {} }),
			credentials
		);

		const [verification] = requestLog.find('POST', /verify-webhook-signature$/);
		expect(verification?.body).toMatchObject({
			transmission_id: 'tid',
			transmission_sig: 'valid',
			auth_algo: '',
			webhook_id: credentials.paypal!.webhookId,
			webhook_event: { id: 'WH-1' }
		});
	});

	it('liefert null für irrelevante Events', async () => {
		const outcome = await webhooks.processWebhook(
			webhook({ id: 'WH-1', event_type: 'CUSTOMER.UPDATED', resource: {} }),
			credentials
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
		await expect(webhooks.processWebhook(request, credentials)).rejects.toMatchObject({
			code: 'INVALID_WEBHOOK_SIGNATURE'
		});
	});
});
