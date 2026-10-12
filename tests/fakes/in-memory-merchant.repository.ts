import type { MerchantRepository } from '#src/domain/merchant/models/merchant.repository.ts';
import type { Merchant } from '#src/domain/merchant/models/merchant.schema.ts';

export const createInMemoryMerchantRepository = (
	initial: { merchant: Merchant; apiKeyHash: string }[] = []
): MerchantRepository => {
	const byId = new Map(initial.map((entry) => [entry.merchant.id, entry]));

	return {
		insert: (merchant, apiKeyHash) => {
			byId.set(merchant.id, { merchant, apiKeyHash });
			return Promise.resolve(merchant);
		},
		findById: (id) => Promise.resolve(byId.get(id)?.merchant ?? null),
		findByApiKeyHash: (hash) =>
			Promise.resolve(
				[...byId.values()].find((entry) => entry.apiKeyHash === hash)?.merchant ?? null
			)
	};
};
