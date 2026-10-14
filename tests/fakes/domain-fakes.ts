import { faker } from '@faker-js/faker';
import { vi } from 'vitest';
import type {
	AccountingGateway,
	AccountingInvoiceStatus
} from '#src/domain/accounting/models/accounting.port.ts';
import type { PaymentConfig } from '#src/domain/config/models/payment-config.schema.ts';
import type {
	PaymentProvider,
	PaymentProviderRegistry
} from '#src/domain/payment/models/payment-provider.port.ts';
import { DomainError } from '#src/shared/errors/domain-error.ts';
import { buildPaymentConfig } from '../factories/config.factory.ts';

/** `vi.fn()`-Fakes der Domain-Ports für Unit-Tests der Actions. */
export const fakeApiKey = (): string =>
	`ewk_live_${faker.string.hexadecimal({ length: 48, prefix: '' })}`;

export const fakeConfigSource = (config: PaymentConfig = buildPaymentConfig()) => ({
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

/** Wero-Fake lehnt jeden Checkout ab (Provider-Vorgaben). */
export const fakeProviderRegistry = (): PaymentProviderRegistry => ({
	stripe: fakeProvider('stripe'),
	paypal: fakeProvider('paypal'),
	wero: {
		...fakeProvider('wero'),
		assertEligible: () => {
			throw new DomainError('VALIDATION_FAILED', 'nicht geeignet');
		}
	}
});

export const fakeAccounting = (status: AccountingInvoiceStatus = 'DRAFT'): AccountingGateway => ({
	upsertContact: vi.fn(() => Promise.resolve('contact-1')),
	createInvoice: vi.fn(() => Promise.resolve({ id: 'invoice-1', status, grossAmount: 0 })),
	finalizeInvoice: vi.fn(() => Promise.resolve()),
	bookPayment: vi.fn(() => Promise.resolve())
});
