import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, type TestContext } from './support/test-app.ts';

describe('System-Endpunkte', () => {
	let ctx: TestContext;

	beforeAll(async () => {
		ctx = await createTestContext();
	});

	afterAll(async () => {
		await ctx.close();
	});

	it('GET /health antwortet mit ok', async () => {
		const response = await ctx.app.request('/health');

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: 'ok' });
	});

	it('GET /openapi.json beschreibt alle öffentlichen Routen', async () => {
		const response = await ctx.app.request('/openapi.json');
		const spec = (await response.json()) as { paths: Record<string, unknown> };

		expect(Object.keys(spec.paths)).toEqual(
			expect.arrayContaining([
				'/health',
				'/v1/checkouts',
				'/v1/checkouts/{id}',
				'/v1/admin/merchants'
			])
		);
	});

	it('unbekannte Routen liefern 404 im Fehlerformat', async () => {
		const response = await ctx.app.request('/gibt-es-nicht');

		expect(response.status).toBe(404);
		expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
	});
});
