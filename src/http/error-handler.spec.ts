import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DomainError, type DomainErrorCode } from '../shared/errors/domain-error.ts';
import { silentLogger } from '../shared/logger/logger.ts';
import { createErrorHandler } from './error-handler.ts';

const appThrowing = (error: unknown, logger = silentLogger) => {
	const app = new Hono();
	app.onError(createErrorHandler(logger));
	app.get('/', () => {
		throw error;
	});
	return app;
};

describe('createErrorHandler', () => {
	it.each([
		['VALIDATION_FAILED', 400],
		['UNAUTHORIZED', 401],
		['NOT_FOUND', 404],
		['PROVIDER_NOT_CONFIGURED', 422],
		['INVALID_WEBHOOK_SIGNATURE', 400],
		['UPSTREAM_ERROR', 502]
	] as [DomainErrorCode, number][])('%s → %i', async (code, status) => {
		const response = await appThrowing(new DomainError(code, 'msg')).request('/');

		expect(response.status).toBe(status);
		expect(await response.json()).toEqual({ error: { code, message: 'msg' } });
	});

	it('mappt ZodError auf VALIDATION_FAILED', async () => {
		const zodError = z.string().safeParse(1).error;

		const response = await appThrowing(zodError).request('/');

		expect(response.status).toBe(400);
	});

	it('verbirgt Details unbekannter Fehler und loggt sie', async () => {
		const logger = { ...silentLogger, error: vi.fn() };

		const response = await appThrowing(new Error('DB-Passwort xyz'), logger).request('/');

		expect(response.status).toBe(500);
		expect(await response.text()).not.toContain('xyz');
		expect(logger.error).toHaveBeenCalledOnce();
	});
});
