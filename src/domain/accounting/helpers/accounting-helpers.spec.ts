import { describe, expect, it } from 'vitest';
import { buildLineItem } from '#tests/factories/checkout.factory.ts';
import { buildPaymentRecord } from '#tests/factories/payment.factory.ts';
import { buildInvoiceDraft } from './build-invoice-draft.helper.ts';
import { toPaymentMethod } from './to-payment-method.helper.ts';

describe('toPaymentMethod', () => {
	it.each([
		['stripe', 'STRIPE'],
		['paypal', 'PAYPAL'],
		['wero', 'WERO']
	] as const)('%s → %s', (provider, expected) => {
		expect(toPaymentMethod(provider)).toBe(expected);
	});
});

describe('buildInvoiceDraft', () => {
	it('übernimmt Nettopositionen in EUR mit Checkout-ID als Idempotenz-Schlüssel', () => {
		const payment = buildPaymentRecord({
			items: [
				buildLineItem({
					name: 'A',
					quantity: 2,
					unitNetAmount: 999,
					taxRate: 19,
					description: 'Info'
				}),
				buildLineItem({ name: 'B', quantity: 1, unitNetAmount: 107, taxRate: 7 })
			]
		});

		expect(buildInvoiceDraft(payment)).toEqual({
			contactId: payment.contactId,
			externalReference: payment.checkoutId,
			headerText: `Bestellung ${payment.reference}`,
			tax: payment.tax,
			items: [
				{ name: 'A', description: 'Info', quantity: 2, unitPriceNet: 9.99, taxRate: 19 },
				{ name: 'B', quantity: 1, unitPriceNet: 1.07, taxRate: 7 }
			]
		});
	});
});
