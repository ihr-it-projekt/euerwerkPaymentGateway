import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import { buildCustomer } from '#tests/factories/checkout.factory.ts';
import { EUERWERK_API } from '#tests/mock-server/constants.ts';
import { requestLog } from '#tests/mock-server/request-log.ts';
import { buildContactPayload } from './build-contact-payload.helper.ts';
import { createEuerwerkAccountingGateway } from './euerwerk-accounting.gateway.ts';

const gateway = createEuerwerkAccountingGateway(EUERWERK_API);
const token = faker.string.alphanumeric(32);

describe('buildContactPayload', () => {
	it('baut Personen mit Adresse', () => {
		const customer = buildCustomer({
			firstName: 'Erika',
			lastName: 'Muster',
			address: {
				line1: 'Weg 1',
				line2: 'Hinterhaus',
				postalCode: '12345',
				city: 'Berlin',
				country: 'DE'
			}
		});

		expect(buildContactPayload(customer)).toEqual({
			type: 'CUSTOMER',
			kind: 'PERSON',
			name: 'Erika Muster',
			email: customer.email,
			firstName: 'Erika',
			lastName: 'Muster',
			addressStreet: 'Weg 1, Hinterhaus',
			addressZip: '12345',
			addressCity: 'Berlin',
			addressCountry: 'DE'
		});
	});

	it('nutzt die E-Mail als Namen, wenn sonst nichts bekannt ist', () => {
		const customer = { id: 'c1', email: 'a@b.de' };

		expect(buildContactPayload(customer)).toEqual({
			type: 'CUSTOMER',
			kind: 'PERSON',
			name: 'a@b.de',
			email: 'a@b.de'
		});
	});
});

describe('EuerwerkAccountingGateway', () => {
	it('legt Kontakte mit Bearer-Token an', async () => {
		const id = await gateway.createContact(token, buildCustomer());

		expect(id).toEqual(expect.any(String));
		expect(requestLog.find('POST', /\/contacts$/)[0]?.headers.get('authorization')).toBe(
			`Bearer ${token}`
		);
	});

	it('sendet Rechnungspositionen mit unitPrice (netto) und liefert grossAmount', async () => {
		const invoice = await gateway.createInvoice(token, {
			contactId: 'c1',
			headerText: 'Bestellung 1',
			items: [{ name: 'A', quantity: 2, unitPriceNet: 10, taxRate: 19 }]
		});

		expect(invoice.grossAmount).toBe(23.8);
		expect(requestLog.find('POST', /\/invoices$/)[0]?.body).toEqual({
			contactId: 'c1',
			headerText: 'Bestellung 1',
			items: [{ name: 'A', quantity: 2, unitPrice: 10, taxRate: 19 }]
		});
	});

	it('schreibt fest und bucht die Zahlung mit ISO-Datum', async () => {
		const paymentDate = faker.date.recent();

		await gateway.finalizeInvoice(token, 'inv-1');
		await gateway.bookPayment(token, 'inv-1', {
			amount: 23.8,
			paymentDate,
			paymentMethod: 'CREDIT_CARD',
			comment: 'stripe pi_1'
		});

		expect(requestLog.find('POST', /inv-1\/enshrine$/)).toHaveLength(1);
		expect(requestLog.find('POST', /inv-1\/book-amount$/)[0]?.body).toEqual({
			amount: 23.8,
			paymentDate: paymentDate.toISOString(),
			paymentMethod: 'CREDIT_CARD',
			comment: 'stripe pi_1'
		});
	});
});
