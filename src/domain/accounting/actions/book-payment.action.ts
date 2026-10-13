import type { PaymentRecord } from '../../checkout/models/checkout.schema.ts';
import { buildInvoiceDraft } from '../helpers/build-invoice-draft.helper.ts';
import { toPaymentMethod } from '../helpers/to-payment-method.helper.ts';
import type { AccountingGateway, AccountingInvoice } from '../models/accounting.port.ts';

export interface BookingResult {
	invoiceId: string;
	alreadyBooked: boolean;
}

/**
 * Verbucht eine bezahlte Zahlung in EÜRwerk: Rechnung → festschreiben → Zahlung buchen.
 * Idempotent über `externalReference` und den Rechnungsstatus – Provider-Retries sind sicher.
 * Fehler werden geworfen, damit der Webhook mit 5xx antwortet und der Provider es erneut versucht.
 */
export class BookPaymentAction {
	readonly #accounting: AccountingGateway;

	constructor(accounting: AccountingGateway) {
		this.#accounting = accounting;
	}

	async execute(apiKey: string, payment: PaymentRecord): Promise<BookingResult> {
		const invoice = await this.#accounting.createInvoice(apiKey, buildInvoiceDraft(payment));
		if (invoice.status === 'PAID') {
			return { invoiceId: invoice.id, alreadyBooked: true };
		}
		await this.#finalizeIfDraft(apiKey, invoice);
		await this.#accounting.bookPayment(apiKey, invoice.id, {
			amount: payment.amountTotal / 100,
			paymentDate: new Date(),
			paymentMethod: toPaymentMethod(payment.provider),
			comment: `${payment.provider} ${payment.providerPaymentId ?? payment.checkoutId}`
		});
		return { invoiceId: invoice.id, alreadyBooked: false };
	}

	async #finalizeIfDraft(apiKey: string, invoice: AccountingInvoice): Promise<void> {
		if (invoice.status === 'DRAFT') {
			await this.#accounting.finalizeInvoice(apiKey, invoice.id);
		}
	}
}
