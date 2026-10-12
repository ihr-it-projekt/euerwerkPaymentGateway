import { faker } from '@faker-js/faker';
import type {
	CreateMerchantInput,
	Merchant,
	MerchantCredentials
} from '#src/domain/merchant/models/merchant.schema.ts';
import { SHOP_WEBHOOK_URL } from '../mock-server/constants.ts';

export const buildCredentials = (
	overrides: Partial<MerchantCredentials> = {}
): MerchantCredentials => ({
	webhookSigningSecret: `whsec_${faker.string.alphanumeric(32)}`,
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
	accounting: { apiToken: faker.string.alphanumeric(40) },
	...overrides
});

export const buildMerchant = (overrides: Partial<Merchant> = {}): Merchant => ({
	id: faker.string.uuid(),
	name: faker.company.name(),
	shopWebhookUrl: SHOP_WEBHOOK_URL,
	credentials: buildCredentials(),
	createdAt: faker.date.past(),
	...overrides
});

export const buildCreateMerchantInput = (
	overrides: Partial<CreateMerchantInput> = {}
): CreateMerchantInput => {
	const { webhookSigningSecret: _secret, ...providerCredentials } = buildCredentials();
	return {
		name: faker.company.name(),
		shopWebhookUrl: SHOP_WEBHOOK_URL,
		...providerCredentials,
		...overrides
	};
};
