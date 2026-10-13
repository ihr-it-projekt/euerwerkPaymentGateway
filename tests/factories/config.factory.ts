import { faker } from '@faker-js/faker';
import type { PaymentConfig } from '#src/domain/config/models/payment-config.schema.ts';

/** Vollständig konfigurierter Mandant (Stripe, PayPal, Wero über Stripe). */
export const buildPaymentConfig = (overrides: Partial<PaymentConfig> = {}): PaymentConfig => ({
	stripe: {
		secretKey: `sk_test_${faker.string.alphanumeric(24)}`,
		webhookSecret: `whsec_${faker.string.alphanumeric(32)}`
	},
	paypal: {
		clientId: faker.string.alphanumeric(40),
		clientSecret: faker.string.alphanumeric(40),
		webhookId: faker.string.alphanumeric(17).toUpperCase()
	},
	wero: { acquirer: 'stripe' },
	...overrides
});
