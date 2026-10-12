import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { recorded, requestLog } from '#tests/mock-server/request-log.ts';
import { mockServer } from '#tests/mock-server/server.ts';
import { fetchJson } from './fetch-json.helper.ts';

const URL = 'http://upstream.test/resource';

describe('fetchJson', () => {
	it('sendet JSON und parst die Antwort', async () => {
		mockServer.use(
			http.post(
				URL,
				recorded(() => HttpResponse.json({ ok: true }))
			)
		);

		const result = await fetchJson(URL, {
			method: 'POST',
			body: { a: 1 },
			headers: { 'X-Test': '1' }
		});

		expect(result).toEqual({ ok: true });
		const [call] = requestLog.find('POST', /\/resource$/);
		expect(call?.body).toEqual({ a: 1 });
		expect(call?.headers.get('content-type')).toBe('application/json');
		expect(call?.headers.get('x-test')).toBe('1');
	});

	it('sendet Formulardaten unverändert', async () => {
		mockServer.use(
			http.post(
				URL,
				recorded(() => HttpResponse.json({}))
			)
		);

		await fetchJson(URL, { method: 'POST', formBody: new URLSearchParams({ grant_type: 'x' }) });

		expect(requestLog.find('POST', /\/resource$/)[0]?.body).toEqual({ grant_type: 'x' });
	});

	it('liefert null für leere Antworten', async () => {
		mockServer.use(http.get(URL, () => new HttpResponse(null, { status: 204 })));

		expect(await fetchJson(URL)).toBeNull();
	});

	it('wirft UPSTREAM_ERROR bei Nicht-2xx inkl. Status', async () => {
		mockServer.use(http.get(URL, () => HttpResponse.text('kaputt', { status: 503 })));

		await expect(fetchJson(URL)).rejects.toMatchObject({
			code: 'UPSTREAM_ERROR',
			message: expect.stringContaining('503') as string
		});
	});
});
