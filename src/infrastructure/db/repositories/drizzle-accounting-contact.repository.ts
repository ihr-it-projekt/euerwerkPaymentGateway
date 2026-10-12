import { and, eq } from 'drizzle-orm';
import type { AccountingContactRepository } from '../../../domain/accounting/models/accounting.port.ts';
import type { Database } from '../database.ts';
import { accountingContacts } from '../schema.ts';

export const createDrizzleAccountingContactRepository = (
	db: Database
): AccountingContactRepository => ({
	find: async (merchantId, customerId) => {
		const [row] = await db
			.select({ contactId: accountingContacts.contactId })
			.from(accountingContacts)
			.where(
				and(
					eq(accountingContacts.merchantId, merchantId),
					eq(accountingContacts.customerId, customerId)
				)
			)
			.limit(1);
		return row?.contactId ?? null;
	},
	save: async (merchantId, customerId, contactId) => {
		await db
			.insert(accountingContacts)
			.values({ merchantId, customerId, contactId })
			.onConflictDoNothing();
	}
});
