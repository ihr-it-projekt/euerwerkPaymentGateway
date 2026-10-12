import { and, eq, inArray, type SQL } from 'drizzle-orm';
import type { CheckoutRepository } from '../../../domain/checkout/models/checkout.repository.ts';
import type { Checkout } from '../../../domain/checkout/models/checkout.schema.ts';
import type { Database } from '../database.ts';
import { firstOrNull, firstOrThrow } from '../first-row.helper.ts';
import { checkouts } from '../schema.ts';

type CheckoutPatch = Partial<typeof checkouts.$inferInsert>;

const findOne = async (db: Database, condition: SQL | undefined): Promise<Checkout | null> =>
	firstOrNull(await db.select().from(checkouts).where(condition).limit(1));

const update = async (db: Database, id: string, patch: CheckoutPatch): Promise<Checkout> => {
	const rows = await db
		.update(checkouts)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(checkouts.id, id))
		.returning();
	return firstOrThrow(rows, `Checkout ${id}`);
};

export const createDrizzleCheckoutRepository = (db: Database): CheckoutRepository => ({
	insert: async (checkout) =>
		firstOrThrow(await db.insert(checkouts).values(checkout).returning(), 'Checkout'),
	findById: (merchantId, id) =>
		findOne(db, and(eq(checkouts.merchantId, merchantId), eq(checkouts.id, id))),
	findByProviderReference: (merchantId, providers, providerReference) =>
		findOne(
			db,
			and(
				eq(checkouts.merchantId, merchantId),
				inArray(checkouts.provider, [...providers]),
				eq(checkouts.providerReference, providerReference)
			)
		),
	linkProvider: (id, link) => update(db, id, link),
	updateStatus: (id, statusUpdate) => update(db, id, statusUpdate),
	updateAccounting: (id, accountingUpdate) => update(db, id, accountingUpdate)
});
