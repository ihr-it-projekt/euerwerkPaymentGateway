import { beforeEach, describe, expect, it } from 'vitest';
import { euerwerkMock } from '../mock-server/handlers/euerwerk.handlers.ts';
import { paypalMock } from '../mock-server/handlers/paypal.handlers.ts';
import { stripeMock } from '../mock-server/handlers/stripe.handlers.ts';
import { requestLog } from '../mock-server/request-log.ts';
import { createCheckout, getCheckout, postCheckout, providerRef } from './support/checkout-api.ts';
import { sendPayPalEvent, sendStripeEvent } from './support/provider-webhooks.ts';
import {
	authHeaders,
	createTenant,
	createTestApp,
	getWebhookUrls,
	type TestTenant
} from './support/test-app.ts';

describe('Feste Nettopreise & Steuer aus EÜRwerk (OSS, Reverse Charge)', () => {
	const app = createTestApp();
	let tenant: TestTenant;

	beforeEach(() => {
		tenant = createTenant();
	});

	it('zieht bei OSS (AT 20 %) Netto + Steuer ein und bucht mit Steuerland/-regime', async () => {
		const checkout = await createCheckout(app, tenant.apiKey, {
			provider: 'stripe',
			tax: { country: 'AT', regime: 'OSS' },
			items: [{ name: 'Lizenz', quantity: 2, unitNetAmount: 1000, taxRate: 20 }]
		});
		const { stripe: webhookUrl } = await getWebhookUrls(app, tenant.apiKey);

		await sendStripeEvent(app, tenant, {
			webhookUrl: webhookUrl!,
			type: 'checkout.session.completed',
			session: stripeMock.updateSession(providerRef(checkout), {
				status: 'complete',
				payment_status: 'paid'
			})
		});

		expect(checkout).toMatchObject({ amountNet: 2000, amountTax: 400, amountTotal: 2400 });
		expect(requestLog.find('POST', /\/v1\/checkout\/sessions$/)[0]?.body).toMatchObject({
			'line_items[0][price_data][unit_amount]': '1000',
			'line_items[0][price_data][tax_behavior]': 'exclusive',
			'line_items[1][price_data][unit_amount]': '400',
			'line_items[1][price_data][product_data][name]': 'Umsatzsteuer 20 % (AT)',
			'metadata[pgw_tax_country]': 'AT',
			'metadata[pgw_tax_regime]': 'OSS'
		});
		expect(euerwerkMock.invoices(tenant.apiKey)[0]?.body).toMatchObject({
			taxCountry: 'AT',
			taxRegime: 'OSS',
			priceMode: 'NET',
			items: [{ quantity: 2, unitPrice: 10, taxRate: 20 }]
		});
		expect(requestLog.find('POST', /book-amount$/)[0]?.body).toMatchObject({ amount: 24 });
		expect(euerwerkMock.invoices(tenant.apiKey)[0]).toMatchObject({
			grossAmount: 24,
			status: 'PAID'
		});
		expect(await getCheckout(app, tenant.apiKey, checkout.id)).toMatchObject({
			status: 'SUCCEEDED',
			tax: { country: 'AT', regime: 'OSS' },
			amountNet: 2000,
			amountTax: 400
		});
	});

	it('verarbeitet Dezimalsätze (FI 25,5 %) über PayPal verlustfrei', async () => {
		const checkout = await createCheckout(app, tenant.apiKey, {
			provider: 'paypal',
			tax: { country: 'FI', regime: 'OSS' },
			items: [{ name: 'Lizenz', quantity: 1, unitNetAmount: 1000, taxRate: 25.5 }]
		});
		const { paypal: webhookUrl } = await getWebhookUrls(app, tenant.apiKey);
		paypalMock.approveOrder(providerRef(checkout));

		await sendPayPalEvent(app, {
			webhookUrl: webhookUrl!,
			eventType: 'CHECKOUT.ORDER.APPROVED',
			resource: { id: providerRef(checkout) }
		});

		expect(requestLog.find('POST', /\/v2\/checkout\/orders$/)[0]?.body).toMatchObject({
			purchase_units: [{ amount: { value: '12.55' }, items: [{ sku: 'pgw-tax-25.5' }] }]
		});
		expect(euerwerkMock.invoices(tenant.apiKey)[0]?.body).toMatchObject({
			taxCountry: 'FI',
			items: [{ unitPrice: 10, taxRate: 25.5 }]
		});
	});

	it('verlangt 0 % bei Reverse Charge und bucht ohne Steuer', async () => {
		const reverseCharge = { country: 'FR', regime: 'REVERSE_CHARGE' } as const;

		const rejected = await postCheckout(app, tenant.apiKey, {
			tax: reverseCharge,
			items: [{ name: 'Lizenz', quantity: 1, unitNetAmount: 1000, taxRate: 20 }]
		});
		const accepted = await createCheckout(app, tenant.apiKey, {
			tax: reverseCharge,
			items: [{ name: 'Lizenz', quantity: 1, unitNetAmount: 1000, taxRate: 0 }]
		});

		expect(rejected.status).toBe(400);
		expect(accepted).toMatchObject({ amountNet: 1000, amountTax: 0, amountTotal: 1000 });
	});
});

describe('GET /v1/providers', () => {
	const app = createTestApp();

	it('liefert die eingerichteten Zahlungsarten des Mandanten', async () => {
		const tenant = createTenant({ paypal: null });

		const response = await app.request('/v1/providers', { headers: authHeaders(tenant.apiKey) });

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ providers: ['stripe', 'wero'] });
	});

	it('dient als Verbindungstest: ungültiger Key → 401', async () => {
		const response = await app.request('/v1/providers', {
			headers: authHeaders('ewk_live_ungueltig')
		});

		expect(response.status).toBe(401);
	});
});
