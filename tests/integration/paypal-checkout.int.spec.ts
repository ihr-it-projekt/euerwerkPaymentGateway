import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { paypalCaptureHandler } from '../mock-server/handlers/paypal.handlers.ts';
import { requestLog } from '../mock-server/request-log.ts';
import { mockServer } from '../mock-server/server.ts';
import { createCheckout, getCheckout } from './support/checkout-api.ts';
import { paypalCaptureResource, sendPayPalEvent } from './support/provider-webhooks.ts';
import {
	createMerchantViaApi,
	createTestContext,
	type CreatedTestMerchant,
	type TestContext
} from './support/test-app.ts';

describe('PayPal Checkout – Ende-zu-Ende', () => {
	let ctx: TestContext;
	let merchant: CreatedTestMerchant;

	beforeAll(async () => {
		ctx = await createTestContext();
		merchant = await createMerchantViaApi(ctx.app);
	});

	afterAll(async () => {
		await ctx.close();
	});

	it('legt eine PayPal-Order an und liefert den payer-action-Link', async () => {
		const checkout = await createCheckout(ctx.app, merchant.apiKey, {
			provider: 'paypal',
			items: [{ name: 'Erweiterung', quantity: 3, unitAmount: 999, taxRate: 19 }]
		});

		expect(checkout.redirectUrl).toContain('sandbox.paypal.com/checkoutnow');
		const [orderCall] = requestLog.find('POST', /\/v2\/checkout\/orders$/);
		expect(orderCall?.headers.get('paypal-request-id')).toBe(`checkout-${checkout.id}`);
		expect(orderCall?.body).toMatchObject({
			intent: 'CAPTURE',
			purchase_units: [
				{
					custom_id: checkout.id,
					amount: { currency_code: 'EUR', value: '29.97' },
					items: [{ quantity: '3', unit_amount: { value: '9.99' } }]
				}
			]
		});
	});

	it('captured die Order bei CHECKOUT.ORDER.APPROVED und verbucht als PAYPAL', async () => {
		const checkout = await createCheckout(ctx.app, merchant.apiKey, { provider: 'paypal' });
		const orderId = checkout.providerReference!;

		const response = await sendPayPalEvent(ctx.app, merchant.id, {
			eventType: 'CHECKOUT.ORDER.APPROVED',
			resource: { id: orderId, status: 'APPROVED' }
		});

		expect(response.status).toBe(200);
		expect(requestLog.find('POST', new RegExp(`/orders/${orderId}/capture$`))).toHaveLength(1);
		const updated = await getCheckout(ctx.app, merchant.apiKey, checkout.id);
		expect(updated).toMatchObject({ status: 'SUCCEEDED', accountingStatus: 'BOOKED' });
		expect(updated.providerPaymentId).toEqual(expect.any(String));
		const [booking] = requestLog.find('POST', /book-amount$/);
		expect(booking?.body).toMatchObject({ paymentMethod: 'PAYPAL' });
	});

	it('setzt bei ausstehendem Capture PROCESSING und schließt per PAYMENT.CAPTURE.COMPLETED ab', async () => {
		mockServer.use(paypalCaptureHandler('PENDING'));
		const checkout = await createCheckout(ctx.app, merchant.apiKey, { provider: 'paypal' });
		const orderId = checkout.providerReference!;

		await sendPayPalEvent(ctx.app, merchant.id, {
			eventType: 'CHECKOUT.ORDER.APPROVED',
			resource: { id: orderId }
		});
		expect((await getCheckout(ctx.app, merchant.apiKey, checkout.id)).status).toBe('PROCESSING');

		await sendPayPalEvent(ctx.app, merchant.id, {
			eventType: 'PAYMENT.CAPTURE.COMPLETED',
			resource: paypalCaptureResource(orderId)
		});
		expect((await getCheckout(ctx.app, merchant.apiKey, checkout.id)).status).toBe('SUCCEEDED');
	});

	it('markiert abgelehnte Captures als FAILED ohne Buchung', async () => {
		const checkout = await createCheckout(ctx.app, merchant.apiKey, { provider: 'paypal' });

		await sendPayPalEvent(ctx.app, merchant.id, {
			eventType: 'PAYMENT.CAPTURE.DENIED',
			resource: paypalCaptureResource(checkout.providerReference!)
		});

		expect((await getCheckout(ctx.app, merchant.apiKey, checkout.id)).status).toBe('FAILED');
		expect(requestLog.find('POST', /\/invoices$/)).toHaveLength(0);
	});

	it('lehnt Webhooks ab, die PayPal nicht verifiziert', async () => {
		const checkout = await createCheckout(ctx.app, merchant.apiKey, { provider: 'paypal' });

		const response = await sendPayPalEvent(ctx.app, merchant.id, {
			eventType: 'CHECKOUT.ORDER.APPROVED',
			resource: { id: checkout.providerReference },
			invalidSignature: true
		});

		expect(response.status).toBe(400);
		const [verification] = requestLog.find('POST', /verify-webhook-signature$/);
		expect(verification?.body).toMatchObject({ webhook_id: merchant.input.paypal!.webhookId });
		expect(requestLog.find('POST', /\/capture$/)).toHaveLength(0);
	});

	it('ignoriert Webhooks zu unbekannten Orders (z.B. anderer Shop im selben PayPal-Konto)', async () => {
		const response = await sendPayPalEvent(ctx.app, merchant.id, {
			eventType: 'PAYMENT.CAPTURE.COMPLETED',
			resource: paypalCaptureResource('UNKNOWN-ORDER')
		});

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ result: 'IGNORED_UNKNOWN' });
	});
});
