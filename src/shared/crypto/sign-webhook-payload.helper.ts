import { createHmac } from 'node:crypto';

/**
 * Signatur für ausgehende Webhooks an den Shop.
 * Header-Format: `t=<unixSeconds>,v1=<hex(HMAC-SHA256(secret, "<t>.<body>"))>`
 */
export const signWebhookPayload = (secret: string, body: string, timestamp: number): string => {
	const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
	return `t=${timestamp},v1=${signature}`;
};
