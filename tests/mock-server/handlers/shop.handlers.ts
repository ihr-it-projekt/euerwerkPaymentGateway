import { http, HttpResponse } from 'msw';
import { SHOP_WEBHOOK_URL } from '../constants.ts';
import { recorded } from '../request-log.ts';

export const shopHandlers = [
	http.post(
		SHOP_WEBHOOK_URL,
		recorded(() => HttpResponse.json({ ok: true }))
	)
];

export const shopFailingHandler = () =>
	http.post(
		SHOP_WEBHOOK_URL,
		recorded(() => HttpResponse.text('down', { status: 503 }))
	);
