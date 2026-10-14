import type { Logger } from '../../../shared/logger/logger.ts';
import type { PaymentRecord } from '../../checkout/models/checkout.schema.ts';
import { buildInvoiceDraft } from '../helpers/build-invoice-draft.helper.ts';
import { toPaymentMethod } from '../helpers/to-payment-method.helper.ts';
import type { AccountingGateway, AccountingInvoice } from '../models/accounting.port.ts';

export interface BookingResult {
	invoiceId: string;
	alreadyBooked: boolean;
}

interface Dependencies {
	accounting: AccountingGateway;
	logger: Logger;
}

/**
 * Verbucht eine bezahlte Zahlung in EÜRwerk: Rechnung (netto, Steuer obendrauf) → festschreiben →
 * Zahlung buchen. Idempotent über `externalReference` und den Rechnungsstatus – Provider-Retries
 * sind sicher. Fehler werden geworfen, damit der Webhook mit 5xx antwortet und der Provider es
 * erneut versucht.
 */
export class BookPaymentAction {
	readonly #deps: Dependencies;

	constructor(deps: Dependencies) {
		this.#deps = deps;
	}

	async execute(apiKey: string, payment: PaymentRecord): Promise<BookingResult> {
		const { accounting } = this.#deps;
		const invoice = await accounting.createInvoice(apiKey, buildInvoiceDraft(payment));
		if (invoice.status === 'PAID') {
			return { invoiceId: invoice.id, alreadyBooked: true };
		}
		this.#warnOnAmountMismatch(invoice, payment);
		await this.#finalizeIfDraft(apiKey, invoice);
		await accounting.bookPayment(apiKey, invoice.id, {
			amount: payment.amountTotal / 100,
			paymentDate: new Date(),
			paymentMethod: toPaymentMethod(payment.provider),
			comment: `${payment.provider} ${payment.providerPaymentId ?? payment.checkoutId}`
		});
		return { invoiceId: invoice.id, alreadyBooked: false };
	}

	async #finalizeIfDraft(apiKey: string, invoice: AccountingInvoice): Promise<void> {
		if (invoice.status === 'DRAFT') {
			await this.#deps.accounting.finalizeInvoice(apiKey, invoice.id);
		}
	}

	/** Darf nicht passieren (gleiche Formel wie EÜRwerk) – sonst manuell prüfen. */
	#warnOnAmountMismatch(invoice: AccountingInvoice, payment: PaymentRecord): void {
		if (Math.round(invoice.grossAmount * 100) !== payment.amountTotal) {
			this.#deps.logger.warn('Rechnungsbetrag weicht vom gezahlten Betrag ab', {
				invoiceId: invoice.id,
				checkoutId: payment.checkoutId,
				invoiced: invoice.grossAmount,
				paid: payment.amountTotal / 100
			});
		}
	}
}
