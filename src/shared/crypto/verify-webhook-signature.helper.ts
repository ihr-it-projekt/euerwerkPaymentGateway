import { timingSafeEqual } from 'node:crypto';
import { signWebhookPayload } from './sign-webhook-payload.helper.ts';

const DEFAULT_TOLERANCE_SECONDS = 300;

interface VerifyInput {
	secret: string;
	body: string;
	header: string;
	nowSeconds: number;
	toleranceSeconds?: number;
}

const parseTimestamp = (header: string): number => {
	const match = /(?:^|,)t=(\d+)/.exec(header);
	return match?.[1] ? Number(match[1]) : Number.NaN;
};

/**
 * Gegenstück zu `signWebhookPayload` – Referenzimplementierung für den Shop.
 * Prüft Signatur (timing-safe) und Alter des Timestamps (Replay-Schutz).
 */
export const verifyWebhookSignature = (input: VerifyInput): boolean => {
	const timestamp = parseTimestamp(input.header);
	const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
	if (!(Math.abs(input.nowSeconds - timestamp) <= tolerance)) {
		return false;
	}
	const expected = Buffer.from(signWebhookPayload(input.secret, input.body, timestamp));
	const actual = Buffer.from(input.header);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
};
