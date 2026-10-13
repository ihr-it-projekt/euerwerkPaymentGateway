import { faker } from '@faker-js/faker';
import type { PaymentRecord } from '#src/domain/checkout/models/checkout.schema.ts';
import { buildLineItem } from './checkout.factory.ts';

export const buildPaymentRecord = (overrides: Partial<PaymentRecord> = {}): PaymentRecord => {
	const items = overrides.items ?? [buildLineItem()];
	return {
		checkoutId: `stripe.cs_test_${faker.string.alphanumeric(24)}`,
		provider: 'stripe',
		reference: faker.string.alphanumeric(12),
		contactId: faker.string.uuid(),
		currency: 'EUR',
		amountTotal: items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0),
		items,
		providerPaymentId: `pi_${faker.string.alphanumeric(24)}`,
		...overrides
	};
};
