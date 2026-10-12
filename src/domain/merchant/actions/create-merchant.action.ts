import { randomUUID } from 'node:crypto';
import { generateSecret } from '../../../shared/crypto/generate-secret.helper.ts';
import { hashApiKey } from '../../../shared/crypto/hash-api-key.helper.ts';
import type { MerchantRepository } from '../models/merchant.repository.ts';
import type { CreateMerchantInput, Merchant } from '../models/merchant.schema.ts';

export interface CreatedMerchant {
	merchant: Merchant;
	/** Wird nur einmalig zurückgegeben – gespeichert ist nur der Hash. */
	apiKey: string;
}

export class CreateMerchantAction {
	readonly #merchants: MerchantRepository;

	constructor(merchants: MerchantRepository) {
		this.#merchants = merchants;
	}

	async execute(input: CreateMerchantInput): Promise<CreatedMerchant> {
		const apiKey = generateSecret('pgw');
		const { name, shopWebhookUrl, ...providerCredentials } = input;
		const merchant = await this.#merchants.insert(
			{
				id: randomUUID(),
				name,
				shopWebhookUrl,
				credentials: { webhookSigningSecret: generateSecret('whsec'), ...providerCredentials },
				createdAt: new Date()
			},
			hashApiKey(apiKey)
		);
		return { merchant, apiKey };
	}
}
