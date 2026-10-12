import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const VERSION = 'v1';

export interface SecretCipher {
	encrypt: (plaintext: string) => string;
	decrypt: (ciphertext: string) => string;
}

const toKey = (base64Key: string): Buffer => {
	const key = Buffer.from(base64Key, 'base64');
	if (key.length !== 32) {
		throw new Error('ENCRYPTION_KEY muss 32 Byte (base64) lang sein');
	}
	return key;
};

/** AES-256-GCM; Format: `v1.<iv>.<authTag>.<ciphertext>` (jeweils base64url). */
export const createSecretCipher = (base64Key: string): SecretCipher => {
	const key = toKey(base64Key);

	return {
		encrypt: (plaintext) => {
			const iv = randomBytes(IV_LENGTH);
			const cipher = createCipheriv(ALGORITHM, key, iv);
			const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
			const parts = [iv, cipher.getAuthTag(), encrypted].map((b) => b.toString('base64url'));
			return [VERSION, ...parts].join('.');
		},
		decrypt: (ciphertext) => {
			const [version, iv = '', tag = '', data = ''] = ciphertext.split('.');
			if (version !== VERSION) {
				throw new Error('Unbekanntes Verschlüsselungsformat');
			}
			const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
			decipher.setAuthTag(Buffer.from(tag, 'base64url'));
			const plain = Buffer.concat([
				decipher.update(Buffer.from(data, 'base64url')),
				decipher.final()
			]);
			return plain.toString('utf8');
		}
	};
};
