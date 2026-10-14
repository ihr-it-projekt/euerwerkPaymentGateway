import { describe, expect, it, vi } from 'vitest';
import { buildPaymentConfig } from '#tests/factories/config.factory.ts';
import { buildPaymentRecord } from '#tests/factories/payment.factory.ts';
import { fakeAccounting, fakeApiKey, fakeConfigSource } from '#tests/fakes/domain-fakes.ts';
import { silentLogger } from '../shared/logger/logger.ts';
import { BookPaymentAction } from './accounting/actions/book-payment.action.ts';
import { HandleProviderWebhookAction } from './payment/actions/handle-provider-webhook.action.ts';
import type { PaymentOutcome } from './payment/models/payment-provider.port.ts';
import { GetWebhookEndpointsAction } from './webhook/actions/get-webhook-endpoints.action.ts';

const apiKey = fakeApiKey();

describe('BookPaymentAction', () => {
	it('warnt, wenn der Rechnungsbetrag von EÜRwerk vom gezahlten Betrag abweicht', async () => {
		const accounting = fakeAccounting();
		const payment = buildPaymentRecord();
		vi.mocked(accounting.createInvoice).mockResolvedValueOnce({
			id: 'invoice-1',
			status: 'DRAFT',
			grossAmount: payment.amountTotal / 100 + 0.01
		});
		const logger = { ...silentLogger, warn: vi.fn() };

		await new BookPaymentAction({ accounting, logger }).execute(apiKey, payment);

		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining('weicht'),
			expect.objectContaining({ paid: payment.amountTotal / 100 })
		);
	});

	it('legt die Rechnung an, schreibt fest und bucht die Zahlung', async () => {
		const accounting = fakeAccounting('DRAFT');
		const payment = buildPaymentRecord({ provider: 'wero', amountTotal: 1999 });

		const result = await new BookPaymentAction({ accounting, logger: silentLogger }).execute(
			apiKey,
			payment
		);

		expect(result).toEqual({ invoiceId: 'invoice-1', alreadyBooked: false });
		expect(accounting.createInvoice).toHaveBeenCalledWith(
			apiKey,
			expect.objectContaining({ externalReference: payment.checkoutId })
		);
		expect(accounting.finalizeInvoice).toHaveBeenCalledWith(apiKey, 'invoice-1');
		expect(accounting.bookPayment).toHaveBeenCalledWith(
			apiKey,
			'invoice-1',
			expect.objectContaining({ amount: 19.99, paymentMethod: 'WERO' })
		);
	});

	it.each([
		['bereits festgeschrieben', 'OPEN', 0, 1],
		['bereits bezahlt', 'PAID', 0, 0]
	] as const)('setzt Retries fort: %s', async (_label, status, finalizeCalls, bookCalls) => {
		const accounting = fakeAccounting(status);

		const result = await new BookPaymentAction({ accounting, logger: silentLogger }).execute(
			apiKey,
			buildPaymentRecord()
		);

		expect(result.alreadyBooked).toBe(status === 'PAID');
		expect(accounting.finalizeInvoice).toHaveBeenCalledTimes(finalizeCalls);
		expect(accounting.bookPayment).toHaveBeenCalledTimes(bookCalls);
	});
});

describe('HandleProviderWebhookAction', () => {
	const setup = (outcome: PaymentOutcome | null) => {
		const processWebhook = vi.fn(() => Promise.resolve(outcome));
		const bookPayment = {
			execute: vi.fn(() => Promise.resolve({ invoiceId: 'i-1', alreadyBooked: false }))
		};
		const action = new HandleProviderWebhookAction({
			keyCodec: { encode: vi.fn(), decode: vi.fn(() => apiKey) },
			configSource: fakeConfigSource(),
			webhookProcessors: {
				stripe: { source: 'stripe', processWebhook },
				paypal: { source: 'paypal', processWebhook: vi.fn() }
			},
			bookPayment,
			logger: silentLogger
		});
		return { action, bookPayment };
	};
	const input = {
		source: 'stripe' as const,
		keyToken: 't',
		request: { rawBody: '{}', headers: {} }
	};

	it('bucht bei Zahlungserfolg mit dem entschlüsselten API-Key', async () => {
		const payment = buildPaymentRecord();
		const { action, bookPayment } = setup({
			providerReference: 'cs_1',
			status: 'SUCCEEDED',
			payment
		});

		expect(await action.execute(input)).toEqual({
			result: 'BOOKED',
			invoiceId: 'i-1',
			alreadyBooked: false
		});
		expect(bookPayment.execute).toHaveBeenCalledWith(apiKey, payment);
	});

	it.each([
		[null, { result: 'IGNORED_EVENT' }],
		[
			{ providerReference: 'cs_1', status: 'EXPIRED', payment: null },
			{ result: 'NO_ACTION', status: 'EXPIRED' }
		]
	] as const)('bucht nicht ohne Zahlungsdaten (%#)', async (outcome, expected) => {
		const { action, bookPayment } = setup(outcome);

		expect(await action.execute(input)).toEqual(expected);
		expect(bookPayment.execute).not.toHaveBeenCalled();
	});
});

describe('GetWebhookEndpointsAction', () => {
	it('liefert URLs nur für konfigurierte Kanäle', async () => {
		const action = new GetWebhookEndpointsAction({
			configSource: fakeConfigSource(buildPaymentConfig({ stripe: null, wero: null })),
			keyCodec: { encode: () => 'TOKEN', decode: vi.fn() },
			publicBaseUrl: 'https://gw.test'
		});

		expect(await action.execute(apiKey)).toEqual({
			paypal: 'https://gw.test/v1/webhooks/paypal/TOKEN'
		});
	});
});
