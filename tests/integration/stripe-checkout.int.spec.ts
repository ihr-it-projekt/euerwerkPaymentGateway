import { faker } from '@faker-js/faker';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	euerwerkFailingInvoiceHandler,
	euerwerkMock
} from '../mock-server/handlers/euerwerk.handlers.ts';
import { stripeErrorHandler, stripeMock } from '../mock-server/handlers/stripe.handlers.ts';
import { requestLog } from '../mock-server/request-log.ts';
import { mockServer } from '../mock-server/server.ts';
import { createCheckout, getCheckout, postCheckout, providerRef } from './support/checkout-api.ts';
import { sendStripeEvent } from './support/provider-webhooks.ts';
import {
	createTenant,
	createTestApp,
	getWebhookUrls,
	type TestTenant
} from './support/test-app.ts';

describe('Stripe – zustandsloser Ablauf', () => {
	const app = createTestApp();
	let tenant: TestTenant;
	let webhookUrl: string;

	const paySession = async (sessionId: string, patch: Record<string, unknown> = {}) =>
		sendStripeEvent(app, tenant, {
			webhookUrl,
			type: 'checkout.session.completed',
			session: stripeMock.updateSession(sessionId, {
				status: 'complete',
				payment_status: 'paid',
				payment_intent: `pi_${faker.string.alphanumeric(24)}`,
				...patch
			})
		});

	beforeEach(async () => {
		tenant = createTenant();
		webhookUrl = (await getWebhookUrls(app, tenant.apiKey)).stripe!;
	});

	it('legt Kontakt in EÜRwerk an und speichert alle Checkout-Daten bei Stripe', async () => {
		const checkout = await createCheckout(app, tenant.apiKey, {
			provider: 'stripe',
			reference: 'ORDER-42',
			items: [{ name: 'Lizenz', quantity: 2, unitNetAmount: 1000, taxRate: 19 }]
		});

		expect(checkout).toMatchObject({
			provider: 'stripe',
			status: 'PENDING',
			amountNet: 2000,
			amountTax: 380,
			amountTotal: 2380
		});
		expect(checkout.id).toMatch(/^stripe\.cs_test_/);
		const [contactCall] = requestLog.find('POST', /\/contacts$/);
		expect(contactCall?.body).toMatchObject({ externalSource: 'payment-gateway' });
		const [stripeCall] = requestLog.find('POST', /\/v1\/checkout\/sessions$/);
		expect(stripeCall?.headers.get('authorization')).toBe(
			`Bearer ${tenant.config.stripe!.secretKey}`
		);
		expect(stripeCall?.body).toMatchObject({
			client_reference_id: 'ORDER-42',
			'metadata[pgw_provider]': 'stripe',
			'metadata[pgw_reference]': 'ORDER-42',
			'line_items[0][price_data][product_data][metadata][pgw_tax_rate]': '19'
		});
	});

	it('liefert den Live-Status von Stripe', async () => {
		const checkout = await createCheckout(app, tenant.apiKey);
		expect((await getCheckout(app, tenant.apiKey, checkout.id)).status).toBe('PENDING');

		stripeMock.updateSession(providerRef(checkout), { status: 'complete', payment_status: 'paid' });

		expect((await getCheckout(app, tenant.apiKey, checkout.id)).status).toBe('SUCCEEDED');
	});

	it('bucht nach checkout.session.completed netto + Steuer und idempotent in EÜRwerk', async () => {
		const checkout = await createCheckout(app, tenant.apiKey, {
			reference: 'ORDER-7',
			items: [{ name: 'Lizenz', quantity: 1, unitNetAmount: 840, taxRate: 19 }]
		});

		const response = await paySession(providerRef(checkout));

		expect(await response.json()).toMatchObject({ result: 'BOOKED', alreadyBooked: false });
		const [invoice] = euerwerkMock.invoices(tenant.apiKey);
		expect(invoice).toMatchObject({
			status: 'PAID',
			externalReference: checkout.id,
			grossAmount: 10
		});
		expect(invoice?.body).toMatchObject({
			priceMode: 'NET',
			headerText: 'Bestellung ORDER-7',
			items: [{ name: 'Lizenz', quantity: 1, unitPrice: 8.4, taxRate: 19 }]
		});
		const [booking] = requestLog.find('POST', /book-amount$/);
		expect(booking?.body).toMatchObject({ amount: 10, paymentMethod: 'STRIPE' });
	});

	it('verarbeitet doppelte Webhooks ohne Doppelbuchung', async () => {
		const checkout = await createCheckout(app, tenant.apiKey);
		await paySession(providerRef(checkout));
		requestLog.clear();

		const second = await paySession(providerRef(checkout));

		expect(await second.json()).toMatchObject({ result: 'BOOKED', alreadyBooked: true });
		expect(euerwerkMock.invoices(tenant.apiKey)).toHaveLength(1);
		expect(requestLog.find('POST', /book-amount$/)).toHaveLength(0);
	});

	it('antwortet 502 bei EÜRwerk-Fehlern – der Stripe-Retry bucht später korrekt', async () => {
		const checkout = await createCheckout(app, tenant.apiKey);
		mockServer.use(euerwerkFailingInvoiceHandler());

		const failed = await paySession(providerRef(checkout));
		mockServer.resetHandlers();
		const retried = await paySession(providerRef(checkout));

		expect(failed.status).toBe(502);
		expect(await retried.json()).toMatchObject({ result: 'BOOKED' });
		expect(euerwerkMock.invoices(tenant.apiKey)).toHaveLength(1);
	});

	it('bucht asynchrone Zahlungen erst nach async_payment_succeeded', async () => {
		const checkout = await createCheckout(app, tenant.apiKey);
		const ref = providerRef(checkout);

		const pending = await paySession(ref, { payment_status: 'unpaid' });
		const succeeded = await sendStripeEvent(app, tenant, {
			webhookUrl,
			type: 'checkout.session.async_payment_succeeded',
			session: stripeMock.updateSession(ref, { payment_status: 'paid' })
		});

		expect(await pending.json()).toMatchObject({ result: 'NO_ACTION', status: 'PROCESSING' });
		expect(await succeeded.json()).toMatchObject({ result: 'BOOKED' });
	});

	it('lehnt falsche Signaturen ab und ignoriert fremde Sessions', async () => {
		const checkout = await createCheckout(app, tenant.apiKey);
		const session = stripeMock.updateSession(providerRef(checkout), { payment_status: 'paid' });

		const forged = await sendStripeEvent(app, tenant, {
			webhookUrl,
			type: 'checkout.session.completed',
			session,
			signatureSecret: 'whsec_falsch'
		});
		const foreign = await sendStripeEvent(app, tenant, {
			webhookUrl,
			type: 'checkout.session.completed',
			session: { id: 'cs_fremd', payment_status: 'paid', metadata: {} }
		});

		expect(forged.status).toBe(400);
		expect(await foreign.json()).toMatchObject({ result: 'IGNORED_EVENT' });
		expect(euerwerkMock.invoices(tenant.apiKey)).toHaveLength(0);
	});

	it('meldet 502, wenn Stripe die Session ablehnt', async () => {
		mockServer.use(stripeErrorHandler(400));

		const response = await postCheckout(app, tenant.apiKey);

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({ error: { code: 'UPSTREAM_ERROR' } });
	});
});
