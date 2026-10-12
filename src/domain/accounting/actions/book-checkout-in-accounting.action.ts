import type { Logger } from '../../../shared/logger/logger.ts';
import type { CheckoutRepository } from '../../checkout/models/checkout.repository.ts';
import type { Checkout } from '../../checkout/models/checkout.schema.ts';
import type { Merchant } from '../../merchant/models/merchant.schema.ts';
import { buildInvoiceDraft } from '../helpers/build-invoice-draft.helper.ts';
import { toPaymentMethod } from '../helpers/to-payment-method.helper.ts';
import type { AccountingContactRepository, AccountingGateway } from '../models/accounting.port.ts';

interface Dependencies {
	checkouts: CheckoutRepository;
	accounting: AccountingGateway;
	contacts: AccountingContactRepository;
	logger: Logger;
}

/**
 * Bezahlten Checkout in EÜRwerk verbuchen:
 * Kontakt sicherstellen → Rechnung anlegen → festschreiben → Zahlung buchen.
 * Fehler werden nicht geworfen, sondern als accountingStatus=FAILED persistiert.
 */
export class BookCheckoutInAccountingAction {
	readonly #deps: Dependencies;

	constructor(deps: Dependencies) {
		this.#deps = deps;
	}

	async execute(merchant: Merchant, checkout: Checkout): Promise<Checkout> {
		const apiToken = merchant.credentials.accounting?.apiToken;
		if (!apiToken || checkout.accountingStatus !== 'PENDING') {
			return checkout;
		}
		try {
			const invoiceId = await this.#book(apiToken, merchant.id, checkout);
			return await this.#deps.checkouts.updateAccounting(checkout.id, {
				accountingStatus: 'BOOKED',
				accountingInvoiceId: invoiceId
			});
		} catch (error) {
			this.#deps.logger.error('Buchung in EÜRwerk fehlgeschlagen', {
				checkoutId: checkout.id,
				error: String(error)
			});
			return this.#deps.checkouts.updateAccounting(checkout.id, { accountingStatus: 'FAILED' });
		}
	}

	async #book(apiToken: string, merchantId: string, checkout: Checkout): Promise<string> {
		const { accounting } = this.#deps;
		const contactId = await this.#ensureContact(apiToken, merchantId, checkout);
		const invoice = await accounting.createInvoice(
			apiToken,
			buildInvoiceDraft(checkout, contactId)
		);
		await accounting.finalizeInvoice(apiToken, invoice.id);
		const amount = checkout.amountTotal / 100;
		this.#warnOnRoundingDifference(checkout.id, amount, invoice.grossAmount);
		await accounting.bookPayment(apiToken, invoice.id, {
			amount,
			paymentDate: new Date(),
			paymentMethod: toPaymentMethod(checkout.provider),
			comment: `${checkout.provider} ${checkout.providerPaymentId ?? checkout.providerReference ?? ''}`
		});
		return invoice.id;
	}

	async #ensureContact(apiToken: string, merchantId: string, checkout: Checkout): Promise<string> {
		const { contacts, accounting } = this.#deps;
		const existing = await contacts.find(merchantId, checkout.customer.id);
		if (existing) {
			return existing;
		}
		const contactId = await accounting.createContact(apiToken, checkout.customer);
		await contacts.save(merchantId, checkout.customer.id, contactId);
		return contactId;
	}

	#warnOnRoundingDifference(checkoutId: string, paid: number, invoiced: number): void {
		if (Math.abs(paid - invoiced) >= 0.005) {
			this.#deps.logger.warn('Rechnungsbetrag weicht vom gezahlten Betrag ab', {
				checkoutId,
				paid,
				invoiced
			});
		}
	}
}
