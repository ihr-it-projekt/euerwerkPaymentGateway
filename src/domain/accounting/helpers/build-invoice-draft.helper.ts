import type { Checkout } from '../../checkout/models/checkout.schema.ts';
import type { AccountingInvoiceDraft } from '../models/accounting.port.ts';
import { toNetUnitPrice } from './to-net-unit-price.helper.ts';

export const buildInvoiceDraft = (
	checkout: Checkout,
	contactId: string
): AccountingInvoiceDraft => ({
	contactId,
	headerText: `Bestellung ${checkout.reference}`,
	items: checkout.items.map((item) => ({
		name: item.name,
		...(item.description ? { description: item.description } : {}),
		quantity: item.quantity,
		unitPriceNet: toNetUnitPrice(item.unitAmount, item.taxRate),
		taxRate: item.taxRate
	}))
});
