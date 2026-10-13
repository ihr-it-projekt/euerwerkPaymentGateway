/**
 * Verpackt den EÜRwerk-API-Key verschlüsselt in die Provider-Webhook-URL, damit das zustandslose
 * Gateway beim Webhook weiß, für welchen Mandanten es arbeitet.
 */
export interface WebhookKeyCodec {
	encode: (apiKey: string) => string;
	/** Wirft `NOT_FOUND` bei manipuliertem/fremdem Token. */
	decode: (token: string) => string;
}
