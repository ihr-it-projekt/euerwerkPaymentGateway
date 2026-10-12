import type { Merchant } from './merchant.schema.ts';

/** Das Repository kapselt die Verschlüsselung der Credentials – die Domain sieht nur Klartext. */
export interface MerchantRepository {
	insert: (merchant: Merchant, apiKeyHash: string) => Promise<Merchant>;
	findById: (id: string) => Promise<Merchant | null>;
	findByApiKeyHash: (apiKeyHash: string) => Promise<Merchant | null>;
}
