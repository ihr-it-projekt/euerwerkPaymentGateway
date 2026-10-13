import { beforeEach, describe, expect, it } from 'vitest';
import { euerwerkMock } from '../mock-server/handlers/euerwerk.handlers.ts';
import { paypalMock } from '../mock-server/handlers/paypal.handlers.ts';
import { requestLog } from '../mock-server/request-log.ts';
import { createCheckout, getCheckout, providerRef } from './support/checkout-api.ts';
import { paypalCaptureResource, sendPayPalEvent } from './support/provider-webhooks.ts';
import {
	createTenant,
	createTestApp,
	getWebhookUrls,
	type TestTenant
} from './support/test-app.ts';

describe('PayPal – zustandsloser Ablauf', () => {
	const app = createTestApp();
	let tenant: TestTenant;
	let webhookUrl: string;

	const approve = async (orderId: string) => {
		paypalMock.approveOrder(orderId);
		return sendPayPalEvent(app, {
			webhookUrl,
			eventType: 'CHECKOUT.ORDER.APPROVED',
			resource: { id: orderId, status: 'APPROVED' }
		});
	};

	beforeEach(async () => {
		tenant = createTenant();
		webhookUrl = (await getWebhookUrls(app, tenant.apiKey)).paypal!;
	});

	it('legt die Order mit Gateway-Kennzeichnung und Steuersätzen an', async () => {
		const checkout = await createCheckout(app, tenant.apiKey, {
			provider: 'paypal',
			reference: 'ORDER-9',
			items: [{ name: 'Erweiterung', quantity: 3, unitAmount: 999, taxRate: 7 }]
		});

		expect(checkout.id).toMatch(/^paypal\./);
		expect(checkout.redirectUrl).toContain('sandbox.paypal.com/checkoutnow');
		const [orderCall] = requestLog.find('POST', /\/v2\/checkout\/orders$/);
		expect(orderCall?.body).toMatchObject({
			purchase_units: [
				{
					reference_id: 'ORDER-9',
					custom_id: expect.stringMatching(/^pgw:/) as string,
					amount: { value: '29.97' },
					items: [{ quantity: '3', sku: 'pgw-tax-7', unit_amount: { value: '9.99' } }]
				}
			]
		});
	});

	it('captured bei Freigabe und bucht als PAYPAL in EÜRwerk', async () => {
		const checkout = await createCheckout(app, tenant.apiKey, { provider: 'paypal' });

		const response = await approve(providerRef(checkout));

		expect(await response.json()).toMatchObject({ result: 'BOOKED' });
		expect(requestLog.find('POST', /\/capture$/)).toHaveLength(1);
		expect(requestLog.find('POST', /book-amount$/)[0]?.body).toMatchObject({
			paymentMethod: 'PAYPAL'
		});
		expect(await getCheckout(app, tenant.apiKey, checkout.id)).toMatchObject({
			status: 'SUCCEEDED',
			providerPaymentId: expect.any(String) as string
		});
	});

	it('bucht ausstehende Captures erst bei PAYMENT.CAPTURE.COMPLETED', async () => {
		paypalMock.setCaptureStatus('PENDING');
		const checkout = await createCheckout(app, tenant.apiKey, { provider: 'paypal' });
		const orderId = providerRef(checkout);

		const pending = await approve(orderId);
		paypalMock.completeCapture(orderId);
		const completed = await sendPayPalEvent(app, {
			webhookUrl,
			eventType: 'PAYMENT.CAPTURE.COMPLETED',
			resource: paypalCaptureResource(orderId)
		});

		expect(await pending.json()).toMatchObject({ result: 'NO_ACTION', status: 'PROCESSING' });
		expect(await completed.json()).toMatchObject({ result: 'BOOKED', alreadyBooked: false });
		expect(euerwerkMock.invoices(tenant.apiKey)).toHaveLength(1);
	});

	it('bucht abgelehnte Captures nicht', async () => {
		paypalMock.setCaptureStatus('DECLINED');
		const checkout = await createCheckout(app, tenant.apiKey, { provider: 'paypal' });

		const response = await approve(providerRef(checkout));

		expect(await response.json()).toMatchObject({ result: 'NO_ACTION', status: 'FAILED' });
		expect(euerwerkMock.invoices(tenant.apiKey)).toHaveLength(0);
	});

	it('captured keine fremden Orders aus demselben PayPal-Konto', async () => {
		const foreignOrderId = paypalMock.seedForeignOrder(tenant.config.paypal!.clientId);

		const response = await sendPayPalEvent(app, {
			webhookUrl,
			eventType: 'CHECKOUT.ORDER.APPROVED',
			resource: { id: foreignOrderId }
		});

		expect(await response.json()).toMatchObject({ result: 'IGNORED_EVENT' });
		expect(requestLog.find('POST', /\/capture$/)).toHaveLength(0);
	});

	it('lehnt Webhooks ab, die PayPal nicht verifiziert', async () => {
		const checkout = await createCheckout(app, tenant.apiKey, { provider: 'paypal' });

		const response = await sendPayPalEvent(app, {
			webhookUrl,
			eventType: 'CHECKOUT.ORDER.APPROVED',
			resource: { id: providerRef(checkout) },
			invalidSignature: true
		});

		expect(response.status).toBe(400);
		expect(requestLog.find('POST', /verify-webhook-signature$/)[0]?.body).toMatchObject({
			webhook_id: tenant.config.paypal!.webhookId
		});
	});
});
