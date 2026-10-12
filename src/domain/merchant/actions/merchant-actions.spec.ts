import { describe, expect, it } from 'vitest';
import { buildCreateMerchantInput, buildMerchant } from '#tests/factories/merchant.factory.ts';
import { createInMemoryMerchantRepository } from '#tests/fakes/in-memory-merchant.repository.ts';
import { hashApiKey } from '../../../shared/crypto/hash-api-key.helper.ts';
import { AuthenticateMerchantAction } from './authenticate-merchant.action.ts';
import { CreateMerchantAction } from './create-merchant.action.ts';

describe('CreateMerchantAction', () => {
	it('erzeugt API-Key und Webhook-Secret und speichert nur den Hash', async () => {
		const repo = createInMemoryMerchantRepository();
		const input = buildCreateMerchantInput();

		const { merchant, apiKey } = await new CreateMerchantAction(repo).execute(input);

		expect(apiKey).toMatch(/^pgw_/);
		expect(merchant.credentials.webhookSigningSecret).toMatch(/^whsec_/);
		expect(merchant.credentials.stripe).toEqual(input.stripe);
		expect(await repo.findByApiKeyHash(hashApiKey(apiKey))).toEqual(merchant);
	});
});

describe('AuthenticateMerchantAction', () => {
	const merchant = buildMerchant();
	const apiKey = 'pgw_test-key';
	const action = new AuthenticateMerchantAction(
		createInMemoryMerchantRepository([{ merchant, apiKeyHash: hashApiKey(apiKey) }])
	);

	it('liefert den Merchant zum API-Key', async () => {
		expect(await action.execute(apiKey)).toBe(merchant);
	});

	it.each([undefined, '', 'pgw_falsch'])('wirft UNAUTHORIZED für %s', async (key) => {
		await expect(action.execute(key)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
	});
});
