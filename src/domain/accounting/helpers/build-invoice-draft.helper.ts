import type { PaymentRecord } from '../../checkout/models/checkout.schema.ts';
import type { AccountingInvoiceDraft } from '../models/accounting.port.ts';

/** Nettopositionen 1:1 – EÜRwerk rechnet die Steuer je Satz oben drauf (`priceMode: 'NET'`). */
export const buildInvoiceDraft = (payment: PaymentRecord): AccountingInvoiceDraft => ({
	contactId: payment.contactId,
	externalReference: payment.checkoutId,
	headerText: `Bestellung ${payment.reference}`,
	tax: payment.tax,
	items: payment.items.map((item) => ({
		name: item.name,
		...(item.description ? { description: item.description } : {}),
		quantity: item.quantity,
		unitPriceNet: item.unitNetAmount / 100,
		taxRate: item.taxRate
	}))
});
