import type { Customer, TaxInfo, TaxRate } from '../../checkout/models/checkout.schema.ts';

export type AccountingPaymentMethod = 'STRIPE' | 'PAYPAL' | 'WERO';

export interface AccountingInvoiceItem {
	name: string;
	description?: string;
	quantity: number;
	/** Netto-Einzelpreis in EUR (Dezimal) – Rechnung mit `priceMode: 'NET'`, Steuer obendrauf. */
	unitPriceNet: number;
	taxRate: TaxRate;
}

export interface AccountingInvoiceDraft {
	contactId: string;
	/** Idempotenz-Schlüssel in EÜRwerk (eindeutig pro Mandant) = Checkout-ID des Gateways. */
	externalReference: string;
	headerText: string;
	/** Steuerland/-regime für OSS, Reverse Charge, Kleinunternehmer (EÜRwerk TASK-PGW-08). */
	tax: TaxInfo;
	items: AccountingInvoiceItem[];
}

export type AccountingInvoiceStatus = 'DRAFT' | 'OPEN' | 'PAID' | 'PARTIALLY_PAID' | 'CANCELLED';

export interface AccountingInvoice {
	id: string;
	status: AccountingInvoiceStatus;
	/** Von EÜRwerk berechneter Rechnungsbetrag in EUR – muss dem eingezogenen Betrag entsprechen. */
	grossAmount: number;
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
