import { describe, expect, it } from 'vitest';
import { buildCustomer } from '#tests/factories/checkout.factory.ts';
import { buildPaymentConfig } from '#tests/factories/config.factory.ts';
import { EUERWERK_API } from '#tests/mock-server/constants.ts';
import { euerwerkMock } from '#tests/mock-server/handlers/euerwerk.handlers.ts';
import { requestLog } from '#tests/mock-server/request-log.ts';
import { buildContactPayload } from './build-contact-payload.helper.ts';
import { createEuerwerkAccountingGateway } from './euerwerk-accounting.gateway.ts';
import { createEuerwerkConfigSource } from './euerwerk-config.source.ts';

const accounting = createEuerwerkAccountingGateway(EUERWERK_API);
const configSource = createEuerwerkConfigSource(EUERWERK_API);

describe('buildContactPayload', () => {
	it('baut Organisationen mit externer Referenz und Adresse', () => {
		const customer = buildCustomer({
			companyName: 'Muster GmbH',
			address: { line1: 'Weg 1', line2: 'HH', postalCode: '12345', city: 'Berlin', country: 'DE' }
		});

		expect(buildContactPayload(customer)).toMatchObject({
			externalSource: 'payment-gateway',
			externalId: customer.id,
			kind: 'ORGANIZATION',
			name: 'Muster GmbH',
			organizationName: 'Muster GmbH',
			addressStreet: 'Weg 1, HH'
		});
	});

	it('nutzt die E-Mail als Namen, wenn sonst nichts bekannt ist', () => {
		expect(buildContactPayload({ id: 'c1', email: 'a@b.de' })).toEqual({
			externalSource: 'payment-gateway',
			externalId: 'c1',
			type: 'CUSTOMER',
			kind: 'PERSON',
			name: 'a@b.de',
			email: 'a@b.de'
		});
	});
});

describe('EuerwerkConfigSource', () => {
	it('lädt die Konfiguration mit dem API-Key des Mandanten', async () => {
		const config = buildPaymentConfig({ paypal: null });
		const apiKey = euerwerkMock.registerTenant(config);

		expect(await configSource.load(apiKey)).toMatchObject({ stripe: config.stripe, paypal: null });
		expect(requestLog.all()[0]?.headers.get('authorization')).toBe(`Bearer ${apiKey}`);
	});

	it('wirft UNAUTHORIZED für unbekannte Keys', async () => {
		await expect(configSource.load('ewk_live_unbekannt')).rejects.toMatchObject({
			code: 'UNAUTHORIZED'
		});
	});
});

describe('EuerwerkAccountingGateway', () => {
	it('legt Kontakte idempotent an', async () => {
		const apiKey = euerwerkMock.registerTenant(buildPaymentConfig());
		const customer = buildCustomer();

		const first = await accounting.upsertContact(apiKey, customer);
		const second = await accounting.upsertContact(apiKey, customer);

		expect(second).toBe(first);
	});

	it('legt Rechnungen brutto an, schreibt fest und bucht mit ISO-Datum', async () => {
		const apiKey = euerwerkMock.registerTenant(buildPaymentConfig());
		const paymentDate = new Date('2026-10-13T10:00:00Z');

		const invoice = await accounting.createInvoice(apiKey, {
			contactId: 'c1',
			externalReference: 'stripe.cs_1',
			headerText: 'Bestellung 1',
			items: [{ name: 'A', quantity: 2, unitPriceGross: 11.9, taxRate: 19 }]
		});
		await accounting.finalizeInvoice(apiKey, invoice.id);
		await accounting.bookPayment(apiKey, invoice.id, {
			amount: 23.8,
			paymentDate,
			paymentMethod: 'STRIPE',
			comment: 'stripe pi_1'
		});

		expect(requestLog.find('POST', /\/invoices$/)[0]?.body).toEqual({
			contactId: 'c1',
			externalReference: 'stripe.cs_1',
			headerText: 'Bestellung 1',
			priceMode: 'GROSS',
			items: [{ name: 'A', quantity: 2, unitPrice: 11.9, taxRate: 19 }]
		});
		expect(requestLog.find('POST', /book-amount$/)[0]?.body).toMatchObject({
			paymentDate: paymentDate.toISOString()
		});
		expect(euerwerkMock.invoices(apiKey)[0]?.status).toBe('PAID');
	});
});
