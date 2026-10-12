import type { AccountingContactRepository } from '#src/domain/accounting/models/accounting.port.ts';

export const createInMemoryAccountingContactRepository = (): AccountingContactRepository & {
	entries: Map<string, string>;
} => {
	const entries = new Map<string, string>();
	const key = (merchantId: string, customerId: string): string => `${merchantId}:${customerId}`;

	return {
		entries,
		find: (merchantId, customerId) =>
			Promise.resolve(entries.get(key(merchantId, customerId)) ?? null),
		save: (merchantId, customerId, contactId) => {
			entries.set(key(merchantId, customerId), contactId);
			return Promise.resolve();
		}
	};
};
