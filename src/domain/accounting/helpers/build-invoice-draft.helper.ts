import type { PaymentRecord } from '../../checkout/models/checkout.schema.ts';
import type { AccountingInvoiceDraft } from '../models/accounting.port.ts';

/** Bruttopositionen 1:1 – EÜRwerk rechnet die Steuer heraus (`priceMode: 'GROSS'`). */
export const buildInvoiceDraft = (payment: PaymentRecord): AccountingInvoiceDraft => ({
	contactId: payment.contactId,
	externalReference: payment.checkoutId,
	headerText: `Bestellung ${payment.reference}`,
	items: payment.items.map((item) => ({
		name: item.name,
		...(item.description ? { description: item.description } : {}),
		quantity: item.quantity,
		unitPriceGross: item.unitAmount / 100,
		taxRate: item.taxRate
	}))
});
