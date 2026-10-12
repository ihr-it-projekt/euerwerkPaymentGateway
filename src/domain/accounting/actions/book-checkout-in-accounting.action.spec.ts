import { faker } from '@faker-js/faker';
import { describe, expect, it, vi } from 'vitest';
import { buildCheckout, buildLineItem } from '#tests/factories/checkout.factory.ts';
import { buildCredentials, buildMerchant } from '#tests/factories/merchant.factory.ts';
import { createInMemoryAccountingContactRepository } from '#tests/fakes/in-memory-accounting-contact.repository.ts';
import { createInMemoryCheckoutRepository } from '#tests/fakes/in-memory-checkout.repository.ts';
import type { Checkout } from '../../checkout/models/checkout.schema.ts';
import type { AccountingGateway } from '../models/accounting.port.ts';
import { BookCheckoutInAccountingAction } from './book-checkout-in-accounting.action.ts';

const setup = (checkout: Checkout, grossAmount = checkout.amountTotal / 100) => {
	const checkouts = createInMemoryCheckoutRepository([checkout]);
	const contacts = createInMemoryAccountingContactRepository();
	const invoiceId = faker.string.uuid();
	const accounting: AccountingGateway = {
		createContact: vi.fn(() => Promise.resolve(faker.string.uuid())),
		createInvoice: vi.fn(() => Promise.resolve({ id: invoiceId, grossAmount })),
		finalizeInvoice: vi.fn(() => Promise.resolve()),
		bookPayment: vi.fn(() => Promise.resolve())
	};
	const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
	const action = new BookCheckoutInAccountingAction({ checkouts, accounting, contacts, logger });
	return { action, accounting, contacts, logger, invoiceId };
};

describe('BookCheckoutInAccountingAction', () => {
	const paidCheckout = (merchantId: string): Checkout =>
		buildCheckout({
			merchantId,
			status: 'SUCCEEDED',
			provider: 'paypal',
			providerPaymentId: 'CAPTURE-1',
			items: [buildLineItem({ quantity: 1, unitAmount: 11900, taxRate: 19 })]
		});

	it('legt Kontakt + Rechnung an, schreibt fest und bucht die Zahlung', async () => {
		const merchant = buildMerchant();
		const checkout = paidCheckout(merchant.id);
		const { action, accounting, invoiceId, logger } = setup(checkout);

		const result = await action.execute(merchant, checkout);

		expect(result).toMatchObject({ accountingStatus: 'BOOKED', accountingInvoiceId: invoiceId });
		expect(accounting.finalizeInvoice).toHaveBeenCalledWith(
			merchant.credentials.accounting!.apiToken,
			invoiceId
		);
		expect(accounting.bookPayment).toHaveBeenCalledWith(
			merchant.credentials.accounting!.apiToken,
			invoiceId,
			expect.objectContaining({ amount: 119, paymentMethod: 'PAYPAL', comment: 'paypal CAPTURE-1' })
		);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it('verwendet bekannte Kontakte wieder', async () => {
		const merchant = buildMerchant();
		const checkout = paidCheckout(merchant.id);
		const { action, accounting, contacts } = setup(checkout);
		await contacts.save(merchant.id, checkout.customer.id, 'contact-1');

		await action.execute(merchant, checkout);

		expect(accounting.createContact).not.toHaveBeenCalled();
		expect(accounting.createInvoice).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({ contactId: 'contact-1' })
		);
	});

	it('warnt bei Rundungsdifferenz zwischen Rechnung und Zahlung', async () => {
		const merchant = buildMerchant();
		const checkout = paidCheckout(merchant.id);
		const { action, logger } = setup(checkout, 119.01);

		await action.execute(merchant, checkout);

		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('weicht'),
			expect.objectContaining({ paid: 119, invoiced: 119.01 })
		);
	});

	it('setzt FAILED und loggt, statt zu werfen', async () => {
		const merchant = buildMerchant();
		const checkout = paidCheckout(merchant.id);
		const { action, accounting, logger } = setup(checkout);
		vi.mocked(accounting.createInvoice).mockRejectedValueOnce(new Error('EÜRwerk down'));

		const result = await action.execute(merchant, checkout);

		expect(result.accountingStatus).toBe('FAILED');
		expect(logger.error).toHaveBeenCalledOnce();
	});

	it.each([
		['ohne Buchhaltungs-Token', { accounting: undefined }, 'PENDING'],
		['bereits gebucht', {}, 'BOOKED']
	] as const)('tut nichts %s', async (_label, credentialOverrides, accountingStatus) => {
		const merchant = buildMerchant({ credentials: buildCredentials(credentialOverrides) });
		const checkout = { ...paidCheckout(merchant.id), accountingStatus };
		const { action, accounting } = setup(checkout);

		const result = await action.execute(merchant, checkout);

		expect(result).toBe(checkout);
		expect(accounting.createInvoice).not.toHaveBeenCalled();
	});
});
