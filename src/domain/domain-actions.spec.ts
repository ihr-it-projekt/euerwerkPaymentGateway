import { faker } from '@faker-js/faker';
import { describe, expect, it, vi } from 'vitest';
import { buildCreateCheckoutInput } from '#tests/factories/checkout.factory.ts';
import { buildPaymentConfig } from '#tests/factories/config.factory.ts';
import { buildPaymentRecord } from '#tests/factories/payment.factory.ts';
import { DomainError } from '../shared/errors/domain-error.ts';
import { silentLogger } from '../shared/logger/logger.ts';
import { BookPaymentAction } from './accounting/actions/book-payment.action.ts';
import type {
	AccountingGateway,
	AccountingInvoiceStatus
} from './accounting/models/accounting.port.ts';
import { CreateCheckoutAction } from './checkout/actions/create-checkout.action.ts';
import { GetCheckoutAction } from './checkout/actions/get-checkout.action.ts';
import type { PaymentConfig } from './config/models/payment-config.schema.ts';
import { HandleProviderWebhookAction } from './payment/actions/handle-provider-webhook.action.ts';
import type {
	PaymentOutcome,
	PaymentProvider,
	PaymentProviderRegistry
} from './payment/models/payment-provider.port.ts';
import { GetWebhookEndpointsAction } from './webhook/actions/get-webhook-endpoints.action.ts';

const apiKey = `ewk_live_${faker.string.hexadecimal({ length: 48, prefix: '' })}`;

const configSource = (config: PaymentConfig = buildPaymentConfig()) => ({
	load: vi.fn(() => Promise.resolve(config))
});

const fakeProvider = (name: PaymentProvider['name']): PaymentProvider => ({
	name,
	webhookSource: name === 'paypal' ? 'paypal' : 'stripe',
	createCheckoutSession: vi.fn(() =>
		Promise.resolve({ providerReference: 'cs_test_1', redirectUrl: 'https://pay.test/cs_test_1' })
	),
	getCheckout: vi.fn()
});

const registry = (): PaymentProviderRegistry => ({
	stripe: fakeProvider('stripe'),
	paypal: fakeProvider('paypal'),
	wero: {
		...fakeProvider('wero'),
		assertEligible: () => {
			throw new DomainError('VALIDATION_FAILED', 'nicht geeignet');
		}
	}
});

const fakeAccounting = (status: AccountingInvoiceStatus = 'DRAFT'): AccountingGateway => ({
	upsertContact: vi.fn(() => Promise.resolve('contact-1')),
	createInvoice: vi.fn(() => Promise.resolve({ id: 'invoice-1', status })),
	finalizeInvoice: vi.fn(() => Promise.resolve()),
	bookPayment: vi.fn(() => Promise.resolve())
});

describe('CreateCheckoutAction', () => {
	it('lädt die Konfiguration, legt den Kontakt an und übergibt alles an den Provider', async () => {
		const providers = registry();
		const accounting = fakeAccounting();
		const source = configSource();
		const input = buildCreateCheckoutInput({
			provider: 'stripe',
			items: [{ name: 'A', quantity: 2, unitAmount: 500, taxRate: 19 }]
		});

		const view = await new CreateCheckoutAction({
			configSource: source,
			accounting,
			providers
		}).execute(apiKey, input);

		expect(source.load).toHaveBeenCalledWith(apiKey);
		expect(accounting.upsertContact).toHaveBeenCalledWith(apiKey, input.customer);
		expect(providers.stripe.createCheckoutSession).toHaveBeenCalledWith(
			expect.objectContaining({ amountTotal: 1000, contactId: 'contact-1' }),
			expect.anything()
		);
		expect(view).toMatchObject({ id: 'stripe.cs_test_1', status: 'PENDING', amountTotal: 1000 });
	});

	it.each([
		[
			'nicht konfigurierter Provider',
			'paypal',
			buildPaymentConfig({ paypal: null }),
			'PROVIDER_NOT_CONFIGURED'
		],
		['Provider-Vorgaben verletzt', 'wero', buildPaymentConfig(), 'VALIDATION_FAILED']
	] as const)('bricht ab vor Kontakt-Anlage: %s', async (_label, provider, config, code) => {
		const accounting = fakeAccounting();
		const action = new CreateCheckoutAction({
			configSource: configSource(config),
			accounting,
			providers: registry()
		});

		await expect(
			action.execute(apiKey, buildCreateCheckoutInput({ provider }))
		).rejects.toMatchObject({
			code
		});
		expect(accounting.upsertContact).not.toHaveBeenCalled();
	});
});

describe('GetCheckoutAction', () => {
	it('fragt den richtigen Provider mit der Provider-Referenz ab', async () => {
		const providers = registry();
		const action = new GetCheckoutAction({ configSource: configSource(), providers });

		await action.execute(apiKey, 'wero.cs_test_9');

		expect(providers.wero.getCheckout).toHaveBeenCalledWith('cs_test_9', expect.anything());
	});

	it('prüft die ID vor jedem Upstream-Aufruf', async () => {
		const source = configSource();
		const action = new GetCheckoutAction({ configSource: source, providers: registry() });

		await expect(action.execute(apiKey, 'unsinn')).rejects.toMatchObject({ code: 'NOT_FOUND' });
		expect(source.load).not.toHaveBeenCalled();
	});
});

describe('BookPaymentAction', () => {
	it('legt die Rechnung an, schreibt fest und bucht die Zahlung', async () => {
		const accounting = fakeAccounting('DRAFT');
		const payment = buildPaymentRecord({ provider: 'wero', amountTotal: 1999 });

		const result = await new BookPaymentAction(accounting).execute(apiKey, payment);

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

		const result = await new BookPaymentAction(accounting).execute(apiKey, buildPaymentRecord());

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
			configSource: configSource(),
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
			configSource: configSource(buildPaymentConfig({ stripe: null, wero: null })),
			keyCodec: { encode: () => 'TOKEN', decode: vi.fn() },
			publicBaseUrl: 'https://gw.test'
		});

		expect(await action.execute(apiKey)).toEqual({
			paypal: 'https://gw.test/v1/webhooks/paypal/TOKEN'
		});
	});
});
