import { describe, expect, it } from 'vitest';
import { createTestApp } from './support/test-app.ts';

describe('System-Endpunkte', () => {
	const app = createTestApp();

	it('GET /health antwortet mit ok', async () => {
		const response = await app.request('/health');

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
	});

	it('GET /openapi.json beschreibt alle öffentlichen Routen', async () => {
		const response = await app.request('/openapi.json');
		const spec = (await response.json()) as { paths: Record<string, unknown> };

		expect(Object.keys(spec.paths)).toEqual(
			expect.arrayContaining([
				'/health',
				'/v1/checkouts',
				'/v1/checkouts/{id}',
				'/v1/webhook-endpoints'
			])
		);
	});

	it('unbekannte Routen liefern 404 im Fehlerformat', async () => {
		const response = await app.request('/gibt-es-nicht');

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
	});
});
