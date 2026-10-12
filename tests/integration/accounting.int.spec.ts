import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildCustomer } from '../factories/checkout.factory.ts';
import { euerwerkFailingInvoiceHandler } from '../mock-server/handlers/euerwerk.handlers.ts';
import { shopFailingHandler } from '../mock-server/handlers/shop.handlers.ts';
import { requestLog } from '../mock-server/request-log.ts';
import { mockServer } from '../mock-server/server.ts';
import { createCheckout, getCheckout } from './support/checkout-api.ts';
import { sendStripeEvent } from './support/provider-webhooks.ts';
import {
	createMerchantViaApi,
	createTestContext,
	type CreatedTestMerchant,
	type TestContext
} from './support/test-app.ts';
import type { CheckoutView } from '#src/domain/checkout/helpers/to-checkout-view.helper.ts';

describe('Buchhaltungs-Push nach EÜRwerk', () => {
	let ctx: TestContext;
	let merchant: CreatedTestMerchant;

	const payCheckout = async (
		target: CreatedTestMerchant,
		checkout: CheckoutView
	): Promise<CheckoutView> => {
		await sendStripeEvent(ctx.app, target, {
			type: 'checkout.session.completed',
			session: { id: checkout.providerReference, payment_status: 'paid' }
		});
		return getCheckout(ctx.app, target.apiKey, checkout.id);
	};

	beforeAll(async () => {
		ctx = await createTestContext();
		merchant = await createMerchantViaApi(ctx.app);
	});

	afterAll(async () => {
		await ctx.close();
	});

	it('übergibt Kontakt und Nettopreise im EÜRwerk-Format', async () => {
		const customer = buildCustomer({ companyName: 'Muster GmbH' });
		const checkout = await createCheckout(ctx.app, merchant.apiKey, {
			customer,
			items: [{ name: 'Lizenz', quantity: 1, unitAmount: 11900, taxRate: 19 }]
		});

		await payCheckout(merchant, checkout);

		const [contactCall] = requestLog.find('POST', /\/contacts$/);
		expect(contactCall?.headers.get('authorization')).toBe(
			`Bearer ${merchant.input.accounting!.apiToken}`
		);
		expect(contactCall?.body).toMatchObject({
			type: 'CUSTOMER',
			kind: 'ORGANIZATION',
			name: 'Muster GmbH',
			email: customer.email,
			addressCountry: 'DE'
		});
		const [invoiceCall] = requestLog.find('POST', /\/invoices$/);
		expect(invoiceCall?.body).toMatchObject({
			headerText: `Bestellung ${checkout.reference}`,
			items: [{ name: 'Lizenz', quantity: 1, unitPrice: 100, taxRate: 19 }]
		});
	});

	it('legt den EÜRwerk-Kontakt pro Kunde nur einmal an', async () => {
		const customer = buildCustomer();
		const first = await createCheckout(ctx.app, merchant.apiKey, { customer });
		const second = await createCheckout(ctx.app, merchant.apiKey, { customer });

		await payCheckout(merchant, first);
		await payCheckout(merchant, second);

		expect(requestLog.find('POST', /\/contacts$/)).toHaveLength(1);
		expect(requestLog.find('POST', /\/invoices$/)).toHaveLength(2);
	});

	it('markiert die Buchung als FAILED, benachrichtigt den Shop aber trotzdem', async () => {
		mockServer.use(euerwerkFailingInvoiceHandler());
		const checkout = await createCheckout(ctx.app, merchant.apiKey);

		const paid = await payCheckout(merchant, checkout);

		expect(paid).toMatchObject({ status: 'SUCCEEDED', accountingStatus: 'FAILED' });
		expect(requestLog.find('POST', /payment-gateway\/webhook$/)).toHaveLength(1);
	});

	it('überspringt EÜRwerk für Merchants ohne Buchhaltungs-Zugang', async () => {
		const withoutAccounting = await createMerchantViaApi(ctx.app, { accounting: undefined });
		const checkout = await createCheckout(ctx.app, withoutAccounting.apiKey);
		expect(checkout.accountingStatus).toBe('NOT_REQUIRED');

		const paid = await payCheckout(withoutAccounting, checkout);

		expect(paid).toMatchObject({ status: 'SUCCEEDED', accountingStatus: 'NOT_REQUIRED' });
		expect(requestLog.all().filter((entry) => entry.url.host === 'euerwerk.test')).toHaveLength(0);
	});

	it('bleibt erfolgreich, wenn der Shop-Webhook nicht zugestellt werden kann', async () => {
		mockServer.use(shopFailingHandler());
		const checkout = await createCheckout(ctx.app, merchant.apiKey);

		const paid = await payCheckout(merchant, checkout);

		expect(paid).toMatchObject({ status: 'SUCCEEDED', accountingStatus: 'BOOKED' });
	});
});
