import type { CheckoutRepository } from '#src/domain/checkout/models/checkout.repository.ts';
import type { Checkout } from '#src/domain/checkout/models/checkout.schema.ts';

export interface InMemoryCheckoutRepository extends CheckoutRepository {
	readonly items: Map<string, Checkout>;
}

/** Fake für Unit-Tests – gleiche Semantik wie das Drizzle-Repository. */
export const createInMemoryCheckoutRepository = (
	initial: Checkout[] = []
): InMemoryCheckoutRepository => {
	const items = new Map(initial.map((checkout) => [checkout.id, checkout]));

	const update = (id: string, patch: Partial<Checkout>): Promise<Checkout> => {
		const current = items.get(id);
		if (!current) {
			return Promise.reject(new Error(`Checkout ${id} nicht gefunden`));
		}
		const next = { ...current, ...patch, updatedAt: new Date() };
		items.set(id, next);
		return Promise.resolve(next);
	};

	return {
		items,
		insert: (checkout) => {
			items.set(checkout.id, checkout);
			return Promise.resolve(checkout);
		},
		findById: (merchantId, id) => {
			const checkout = items.get(id);
			return Promise.resolve(checkout?.merchantId === merchantId ? checkout : null);
		},
		findByProviderReference: (merchantId, providers, providerReference) =>
			Promise.resolve(
				[...items.values()].find(
					(c) =>
						c.merchantId === merchantId &&
						providers.includes(c.provider) &&
						c.providerReference === providerReference
				) ?? null
			),
		linkProvider: (id, link) => update(id, link),
		updateStatus: (id, statusUpdate) => update(id, statusUpdate),
		updateAccounting: (id, accountingUpdate) => update(id, accountingUpdate)
	};
};
