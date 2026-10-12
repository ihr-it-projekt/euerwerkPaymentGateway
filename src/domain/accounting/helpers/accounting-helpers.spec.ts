import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import { buildCheckout, buildLineItem } from '#tests/factories/checkout.factory.ts';
import { buildInvoiceDraft } from './build-invoice-draft.helper.ts';
import { toNetUnitPrice } from './to-net-unit-price.helper.ts';
import { toPaymentMethod } from './to-payment-method.helper.ts';

describe('toNetUnitPrice', () => {
	it.each([
		[11900, 19, 100],
		[10700, 7, 100],
		[999, 19, 8.395],
		[500, 0, 5]
	])('%i Cent brutto bei %i%% → %d EUR netto', (gross, rate, expected) => {
		expect(toNetUnitPrice(gross, rate)).toBe(expected);
	});
});

describe('toPaymentMethod', () => {
	it('mappt Provider auf EÜRwerk-Zahlungsarten', () => {
		expect(toPaymentMethod('stripe')).toBe('CREDIT_CARD');
		expect(toPaymentMethod('paypal')).toBe('PAYPAL');
	});
});

describe('buildInvoiceDraft', () => {
	it('übernimmt Positionen mit Nettopreis und Bestellreferenz', () => {
		const contactId = faker.string.uuid();
		const checkout = buildCheckout({
			items: [
				buildLineItem({
					name: 'A',
					quantity: 2,
					unitAmount: 1190,
					taxRate: 19,
					description: 'Info'
				}),
				buildLineItem({ name: 'B', quantity: 1, unitAmount: 107, taxRate: 7 })
			]
		});

		const draft = buildInvoiceDraft(checkout, contactId);

		expect(draft).toEqual({
			contactId,
			headerText: `Bestellung ${checkout.reference}`,
			items: [
				{ name: 'A', description: 'Info', quantity: 2, unitPriceNet: 10, taxRate: 19 },
				{ name: 'B', quantity: 1, unitPriceNet: 1, taxRate: 7 }
			]
		});
	});
});
