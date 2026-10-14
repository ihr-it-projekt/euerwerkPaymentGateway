import { faker } from '@faker-js/faker';
import { priceCheckout } from '#src/domain/checkout/helpers/price-checkout.helper.ts';
import type { PaymentRecord } from '#src/domain/checkout/models/checkout.schema.ts';
import { buildLineItem, DOMESTIC_TAX } from './checkout.factory.ts';

export const buildPaymentRecord = (overrides: Partial<PaymentRecord> = {}): PaymentRecord => {
	const items = overrides.items ?? [buildLineItem()];
	const { amountNet, amountTax, amountTotal } = priceCheckout(items);
	return {
		checkoutId: `stripe.cs_test_${faker.string.alphanumeric(24)}`,
		provider: 'stripe',
		reference: faker.string.alphanumeric(12),
		contactId: faker.string.uuid(),
		currency: 'EUR',
		tax: DOMESTIC_TAX,
		amountNet,
		amountTax,
		amountTotal,
		items,
		providerPaymentId: `pi_${faker.string.alphanumeric(24)}`,
		...overrides
	};
};
