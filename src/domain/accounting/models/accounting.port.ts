import type { Customer, TaxRate } from '../../checkout/models/checkout.schema.ts';

export type AccountingPaymentMethod = 'STRIPE' | 'PAYPAL' | 'WERO';

export interface AccountingInvoiceItem {
	name: string;
	description?: string;
	quantity: number;
	/** Brutto-Einzelpreis in EUR (Dezimal) – Rechnung mit `priceMode: 'GROSS'`. */
	unitPriceGross: number;
	taxRate: TaxRate;
}

export interface AccountingInvoiceDraft {
	contactId: string;
	/** Idempotenz-Schlüssel in EÜRwerk (eindeutig pro Mandant) = Checkout-ID des Gateways. */
	externalReference: string;
	headerText: string;
	items: AccountingInvoiceItem[];
}

export type AccountingInvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'PARTIALLY_PAID' | 'CANCELLED';

export interface AccountingInvoice {
	id: string;
	status: AccountingInvoiceStatus;
}

export interface AccountingPayment {
	amount: number;
	paymentDate: Date;
	paymentMethod: AccountingPaymentMethod;
	comment: string;
}

/**
 * Port zur Buchhaltung (EÜRwerk). Alle Aufrufe mit dem API-Key des Mandanten.
 * `upsertContact` und `createInvoice` sind in EÜRwerk idempotent (externe Referenzen).
 */
export interface AccountingGateway {
	upsertContact: (apiKey: string, customer: Customer) => Promise<string>;
	createInvoice: (apiKey: string, draft: AccountingInvoiceDraft) => Promise<AccountingInvoice>;
	finalizeInvoice: (apiKey: string, invoiceId: string) => Promise<void>;
	bookPayment: (apiKey: string, invoiceId: string, payment: AccountingPayment) => Promise<void>;
}
