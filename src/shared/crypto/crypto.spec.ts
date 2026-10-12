import { randomBytes } from 'node:crypto';
import { faker } from '@faker-js/faker';
import { describe, expect, it } from 'vitest';
import { generateSecret } from './generate-secret.helper.ts';
import { hashApiKey } from './hash-api-key.helper.ts';
import { createSecretCipher } from './secret-cipher.ts';
import { signWebhookPayload } from './sign-webhook-payload.helper.ts';
import { verifyWebhookSignature } from './verify-webhook-signature.helper.ts';

const newKey = (): string => randomBytes(32).toString('base64');

describe('createSecretCipher', () => {
	it('verschlüsselt und entschlüsselt verlustfrei', () => {
		const cipher = createSecretCipher(newKey());
		const secret = faker.string.alphanumeric(64);

		const encrypted = cipher.encrypt(secret);

		expect(encrypted).toMatch(/^v1\./);
		expect(encrypted).not.toContain(secret);
		expect(cipher.decrypt(encrypted)).toBe(secret);
	});

	it('erzeugt pro Aufruf einen neuen IV', () => {
		const cipher = createSecretCipher(newKey());

		expect(cipher.encrypt('gleich')).not.toBe(cipher.encrypt('gleich'));
	});

	it('erkennt Manipulation und falsche Schlüssel', () => {
		const encrypted = createSecretCipher(newKey()).encrypt('geheim');

		expect(() => createSecretCipher(newKey()).decrypt(encrypted)).toThrow();
	});

	it('lehnt unbekannte Formate und falsche Schlüssellängen ab', () => {
		expect(() => createSecretCipher(newKey()).decrypt('v0.a.b.c')).toThrow(/format/i);
		expect(() => createSecretCipher(randomBytes(16).toString('base64'))).toThrow(/32 Byte/);
	});
});

describe('generateSecret / hashApiKey', () => {
	it('erzeugt eindeutige, präfixierte Secrets', () => {
		const a = generateSecret('pgw');

		expect(a).toMatch(/^pgw_[\w-]{43}$/);
		expect(a).not.toBe(generateSecret('pgw'));
	});

	it('hasht deterministisch als SHA-256-Hex', () => {
		const key = generateSecret('pgw');

		expect(hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
		expect(hashApiKey(key)).toBe(hashApiKey(key));
	});
});

describe('Webhook-Signatur', () => {
	const secret = generateSecret('whsec');
	const body = JSON.stringify({ id: faker.string.uuid() });
	const now = 1_760_000_000;

	it('verifiziert selbst signierte Payloads', () => {
		const header = signWebhookPayload(secret, body, now);

		expect(header).toMatch(/^t=1760000000,v1=[0-9a-f]{64}$/);
		expect(verifyWebhookSignature({ secret, body, header, nowSeconds: now + 10 })).toBe(true);
	});

	it.each([
		['falsches Secret', { secret: 'anders' }],
		['veränderter Body', { body: '{}' }],
		['zu alter Timestamp', { nowSeconds: now + 301 }],
		['kaputter Header', { header: 'unsinn' }]
	])('lehnt ab: %s', (_label, override) => {
		const header = signWebhookPayload(secret, body, now);

		expect(verifyWebhookSignature({ secret, body, header, nowSeconds: now, ...override })).toBe(
			false
		);
	});
});
