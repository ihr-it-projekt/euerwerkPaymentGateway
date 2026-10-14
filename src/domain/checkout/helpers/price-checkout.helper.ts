import type { CheckoutAmounts, LineItem, TaxLine } from '../models/checkout.schema.ts';
import { calculateTaxAmount } from './calculate-tax-amount.helper.ts';

export interface PricedCheckout extends CheckoutAmounts {
	taxLines: TaxLine[];
}

const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

const netByTaxRate = (items: readonly LineItem[]): Map<number, number> =>
	items.reduce(
		(groups, item) =>
			groups.set(
				item.taxRate,
				(groups.get(item.taxRate) ?? 0) + item.unitNetAmount * item.quantity
			),
		new Map<number, number>()
	);

/**
 * Nettopreise sind fest, die Steuer kommt oben drauf – je Steuersatz auf die Nettosumme der Gruppe
 * gerechnet und einmal gerundet (wie EÜRwerk im Netto-Modus). Steuerzeilen absteigend nach Satz.
 */
export const priceCheckout = (items: readonly LineItem[]): PricedCheckout => {
	const taxLines = [...netByTaxRate(items).entries()]
		.map(([taxRate, netAmount]) => ({
			taxRate,
			netAmount,
			taxAmount: calculateTaxAmount(netAmount, taxRate)
		}))
		.sort((a, b) => b.taxRate - a.taxRate);
	const amountNet = sum(taxLines.map((line) => line.netAmount));
	const amountTax = sum(taxLines.map((line) => line.taxAmount));
	return { taxLines, amountNet, amountTax, amountTotal: amountNet + amountTax };
};
