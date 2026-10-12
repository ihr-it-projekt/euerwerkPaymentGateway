import { faker } from '@faker-js/faker';
import type {
	Checkout,
	CreateCheckoutInput,
	Customer,
	LineItem
} from '#src/domain/checkout/models/checkout.schema.ts';

export const buildCustomer = (overrides: Partial<Customer> = {}): Customer => ({
	id: faker.string.uuid(),
	email: faker.internet.email(),
	firstName: faker.person.firstName(),
	lastName: faker.person.lastName(),
	address: {
		line1: faker.location.streetAddress(),
		postalCode: faker.location.zipCode('#####'),
		city: faker.location.city(),
		country: 'DE'
	},
	...overrides
});

export const buildLineItem = (overrides: Partial<LineItem> = {}): LineItem => ({
	name: faker.commerce.productName(),
	quantity: faker.number.int({ min: 1, max: 3 }),
	unitAmount: faker.number.int({ min: 100, max: 50_000 }),
	taxRate: 19,
	...overrides
});

export const buildCreateCheckoutInput = (
	overrides: Partial<CreateCheckoutInput> = {}
): CreateCheckoutInput => ({
	provider: 'stripe',
	reference: faker.string.alphanumeric(12),
	currency: 'EUR',
	customer: buildCustomer(),
	items: [buildLineItem()],
	successUrl: faker.internet.url(),
	cancelUrl: faker.internet.url(),
	metadata: {},
	...overrides
});

export const buildCheckout = (overrides: Partial<Checkout> = {}): Checkout => {
	const items = overrides.items ?? [buildLineItem()];
	const now = faker.date.recent();
	return {
		id: faker.string.uuid(),
		merchantId: faker.string.uuid(),
		reference: faker.string.alphanumeric(12),
		provider: 'stripe',
		status: 'PENDING',
		currency: 'EUR',
		amountTotal: items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0),
		customer: buildCustomer(),
		items,
		successUrl: faker.internet.url(),
		cancelUrl: faker.internet.url(),
		metadata: {},
		providerReference: `cs_test_${faker.string.alphanumeric(24)}`,
		providerPaymentId: null,
		redirectUrl: faker.internet.url(),
		accountingStatus: 'PENDING',
		accountingInvoiceId: null,
		createdAt: now,
		updatedAt: now,
		...overrides
	};
};
