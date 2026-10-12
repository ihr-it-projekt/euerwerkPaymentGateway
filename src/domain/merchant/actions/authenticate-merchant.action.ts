import { DomainError } from '../../../shared/errors/domain-error.ts';
import { hashApiKey } from '../../../shared/crypto/hash-api-key.helper.ts';
import type { MerchantRepository } from '../models/merchant.repository.ts';
import type { Merchant } from '../models/merchant.schema.ts';

export class AuthenticateMerchantAction {
	readonly #merchants: MerchantRepository;

	constructor(merchants: MerchantRepository) {
		this.#merchants = merchants;
	}

	async execute(apiKey: string | undefined): Promise<Merchant> {
		if (!apiKey) {
			throw new DomainError('UNAUTHORIZED', 'API-Key fehlt');
		}
		const merchant = await this.#merchants.findByApiKeyHash(hashApiKey(apiKey));
		if (!merchant) {
			throw new DomainError('UNAUTHORIZED', 'Ungültiger API-Key');
		}
		return merchant;
	}
}
