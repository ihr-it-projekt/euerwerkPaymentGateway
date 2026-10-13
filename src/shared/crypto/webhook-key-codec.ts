import type { WebhookKeyCodec } from '../../domain/webhook/models/webhook-key-codec.port.ts';
import { DomainError } from '../errors/domain-error.ts';
import type { SecretCipher } from './secret-cipher.ts';

/** AES-256-GCM: Manipulation oder fremder Schlüssel fallen bei der Entschlüsselung auf. */
export const createWebhookKeyCodec = (cipher: SecretCipher): WebhookKeyCodec => ({
	encode: (apiKey) => cipher.encrypt(apiKey),
	decode: (token) => {
		try {
			return cipher.decrypt(token);
		} catch (error) {
			throw new DomainError('NOT_FOUND', 'Unbekannter Webhook-Endpunkt', { cause: error });
		}
	}
});
