import { eq } from 'drizzle-orm';
import type { MerchantRepository } from '../../../domain/merchant/models/merchant.repository.ts';
import {
	type Merchant,
	MerchantCredentialsSchema
} from '../../../domain/merchant/models/merchant.schema.ts';
import type { SecretCipher } from '../../../shared/crypto/secret-cipher.ts';
import type { Database } from '../database.ts';
import { firstOrThrow } from '../first-row.helper.ts';
import { merchants } from '../schema.ts';

type MerchantRow = typeof merchants.$inferSelect;

export const createDrizzleMerchantRepository = (
	db: Database,
	cipher: SecretCipher
): MerchantRepository => {
	const toMerchant = (row: MerchantRow): Merchant => ({
		id: row.id,
		name: row.name,
		shopWebhookUrl: row.shopWebhookUrl,
		credentials: MerchantCredentialsSchema.parse(
			JSON.parse(cipher.decrypt(row.encryptedCredentials))
		),
		createdAt: row.createdAt
	});

	const findOne = async (condition: ReturnType<typeof eq>): Promise<Merchant | null> => {
		const [row] = await db.select().from(merchants).where(condition).limit(1);
		return row ? toMerchant(row) : null;
	};

	return {
		insert: async (merchant, apiKeyHash) => {
			const rows = await db
				.insert(merchants)
				.values({
					id: merchant.id,
					name: merchant.name,
					apiKeyHash,
					shopWebhookUrl: merchant.shopWebhookUrl,
					encryptedCredentials: cipher.encrypt(JSON.stringify(merchant.credentials)),
					createdAt: merchant.createdAt,
					updatedAt: merchant.createdAt
				})
				.returning();
			return toMerchant(firstOrThrow(rows, 'Merchant'));
		},
		findById: (id) => findOne(eq(merchants.id, id)),
		findByApiKeyHash: (apiKeyHash) => findOne(eq(merchants.apiKeyHash, apiKeyHash))
	};
};
