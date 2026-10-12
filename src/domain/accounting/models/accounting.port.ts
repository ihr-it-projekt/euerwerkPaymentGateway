import type { Customer } from '../../checkout/models/checkout.schema.ts';

export type AccountingPaymentMethod = 'CREDIT_CARD' | 'PAYPAL' | 'BANK_TRANSFER';

export interface AccountingInvoiceItem {
	name: string;
	description?: string;
	quantity: number;
	/** Netto-Einzelpreis in EUR (Dezimal) – EÜRwerk rechnet die Steuer selbst. */
	unitPriceNet: number;
	taxRate: 0 | 7 | 19;
}

export interface AccountingInvoiceDraft {
	contactId: string;
	items: AccountingInvoiceItem[];
	headerText: string;
}

export interface AccountingPayment {
	amount: number;
	paymentDate: Date;
	paymentMethod: AccountingPaymentMethod;
	comment: string;
}

export interface AccountingInvoice {
	id: string;
	/** Von EÜRwerk berechneter Bruttobetrag in EUR. */
	grossAmount: number;
}

/** Port zur Buchhaltung (EÜRwerk). Alle Methoden arbeiten mit dem Token des Merchants. */
export interface AccountingGateway {
	createContact: (apiToken: string, customer: Customer) => Promise<string>;
	createInvoice: (apiToken: string, draft: AccountingInvoiceDraft) => Promise<AccountingInvoice>;
	finalizeInvoice: (apiToken: string, invoiceId: string) => Promise<void>;
	bookPayment: (apiToken: string, invoiceId: string, payment: AccountingPayment) => Promise<void>;
}

/** Zuordnung Shop-Kunde → EÜRwerk-Kontakt (pro Merchant). */
export interface AccountingContactRepository {
	find: (merchantId: string, customerId: string) => Promise<string | null>;
	save: (merchantId: string, customerId: string, contactId: string) => Promise<void>;
}
