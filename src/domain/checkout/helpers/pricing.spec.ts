import { describe, expect, it } from 'vitest';
import { buildCreateCheckoutInput, buildLineItem } from '#tests/factories/checkout.factory.ts';
import { CreateCheckoutInputSchema, TaxRateSchema } from '../models/checkout.schema.ts';
import { calculateTaxAmount } from './calculate-tax-amount.helper.ts';
import { priceCheckout } from './price-checkout.helper.ts';

describe('calculateTaxAmount (identisch zu EÜRwerk)', () => {
	it.each([
		[1000, 19, 190],
		[2517, 19, 478],
		[1000, 20, 200],
		[1000, 25.5, 255],
		[999, 25.5, 255],
		[1050, 7, 74],
		[1000, 0, 0]
	])('%i Cent netto bei %d %% → %i Cent Steuer', (net, rate, tax) => {
		expect(calculateTaxAmount(net, rate)).toBe(tax);
	});
});

describe('priceCheckout', () => {
	it('rechnet die Steuer je Satz auf die Netto-Gruppensumme (einmal gerundet)', () => {
		const priced = priceCheckout([
			buildLineItem({ name: 'A', quantity: 3, unitNetAmount: 839, taxRate: 19 }),
			buildLineItem({ name: 'B', quantity: 1, unitNetAmount: 1000, taxRate: 7 }),
			buildLineItem({ name: 'C', quantity: 1, unitNetAmount: 500, taxRate: 19 })
		]);

		expect(priced.taxLines).toEqual([
			{ taxRate: 19, netAmount: 3017, taxAmount: 573 },
			{ taxRate: 7, netAmount: 1000, taxAmount: 70 }
		]);
		expect(priced).toMatchObject({ amountNet: 4017, amountTax: 643, amountTotal: 4660 });
	});

	it('Netto ist fest: der Nettobetrag entspricht exakt der Summe der Nettopreise', () => {
		const priced = priceCheckout([buildLineItem({ quantity: 3, unitNetAmount: 839, taxRate: 19 })]);

		expect(priced).toMatchObject({ amountNet: 2517, amountTax: 478, amountTotal: 2995 });
	});
});

describe('Steuer-Validierung im Checkout', () => {
	it.each([0, 7, 19, 20, 25.5, 27])('akzeptiert Steuersatz %d', (rate) => {
		expect(TaxRateSchema.safeParse(rate).success).toBe(true);
	});

	it.each([-1, 31, 19.123])('lehnt Steuersatz %d ab', (rate) => {
		expect(TaxRateSchema.safeParse(rate).success).toBe(false);
	});

	it.each(['SMALL_BUSINESS', 'REVERSE_CHARGE', 'NON_EU'] as const)(
		'verlangt 0 %% bei %s',
		(regime) => {
			const withVat = buildCreateCheckoutInput({
				tax: { country: 'FR', regime },
				items: [buildLineItem({ taxRate: 20 })]
			});
			const withoutVat = { ...withVat, items: [buildLineItem({ taxRate: 0 })] };

			expect(CreateCheckoutInputSchema.safeParse(withVat).success).toBe(false);
			expect(CreateCheckoutInputSchema.safeParse(withoutVat).success).toBe(true);
		}
	);
});
