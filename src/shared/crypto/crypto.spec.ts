import { randomBytes } from 'node:crypto';
import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import {
	formatCheckoutId,
	parseCheckoutId
} from '../../domain/checkout/helpers/checkout-id.helper.ts';
import { createSecretCipher } from './secret-cipher.ts';
import { createWebhookKeyCodec } from './webhook-key-codec.ts';

const newKey = (): string => randomBytes(32).toString('base64');

describe('createSecretCipher', () => {
	it('verschlüsselt verlustfrei mit neuem IV pro Aufruf', () => {
		const cipher = createSecretCipher(newKey());
		const secret = faker.string.alphanumeric(64);

		const encrypted = cipher.encrypt(secret);

		expect(encrypted).toMatch(/^v1\./);
		expect(encrypted).not.toContain(secret);
		expect(cipher.encrypt(secret)).not.toBe(encrypted);
		expect(cipher.decrypt(encrypted)).toBe(secret);
	});

	it('lehnt fremde Schlüssel, unbekannte Formate und falsche Schlüssellängen ab', () => {
		const encrypted = createSecretCipher(newKey()).encrypt('geheim');

		expect(() => createSecretCipher(newKey()).decrypt(encrypted)).toThrow();
		expect(() => createSecretCipher(newKey()).decrypt('v0.a.b.c')).toThrow(/format/i);
		expect(() => createSecretCipher(randomBytes(16).toString('base64'))).toThrow(/32 Byte/);
	});
});

describe('createWebhookKeyCodec', () => {
	it('verpackt den API-Key URL-sicher und stellt ihn wieder her', () => {
		const codec = createWebhookKeyCodec(createSecretCipher(newKey()));
		const apiKey = `ewk_live_${faker.string.hexadecimal({ length: 48, prefix: '' })}`;

		const token = codec.encode(apiKey);

		expect(token).toMatch(/^[\w.-]+$/);
		expect(codec.decode(token)).toBe(apiKey);
	});

	it('wirft NOT_FOUND bei manipulierten Tokens', () => {
		const codec = createWebhookKeyCodec(createSecretCipher(newKey()));
		const token = codec.encode('ewk_live_abc');

		expect(() => codec.decode(`${token.slice(0, -2)}xx`)).toThrow(
			expect.objectContaining({ code: 'NOT_FOUND' }) as Error
		);
	});
});

describe('Checkout-ID', () => {
	it('ist zustandslos in Provider und Referenz zerlegbar', () => {
		const id = formatCheckoutId('wero', 'cs_test_a1');

		expect(id).toBe('wero.cs_test_a1');
		expect(parseCheckoutId(id)).toEqual({ provider: 'wero', providerReference: 'cs_test_a1' });
	});

	it.each(['cs_test_1', 'klarna.abc', 'stripe.', 'stripe.a/b', 'paypal.a.b'])(
		'lehnt %s ab',
		(id) => {
			expect(() => parseCheckoutId(id)).toThrow(
				expect.objectContaining({ code: 'NOT_FOUND' }) as Error
			);
		}
	);
});
