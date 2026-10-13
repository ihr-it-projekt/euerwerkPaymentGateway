import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { DomainError } from '../../shared/errors/domain-error.ts';
import type { AppEnv } from '../app-env.ts';
import { extractBearerToken } from './bearer-token.helper.ts';

/**
 * Übernimmt den EÜRwerk-API-Key aus `Authorization: Bearer …`. Geprüft wird er von EÜRwerk selbst
 * beim Laden der Konfiguration – das Gateway kennt keine eigenen Keys.
 */
export const apiKeyAuth = (): MiddlewareHandler<AppEnv> =>
	createMiddleware<AppEnv>(async (c, next) => {
		const apiKey = extractBearerToken(c.req.header('Authorization'));
		if (!apiKey) {
			throw new DomainError('UNAUTHORIZED', 'EÜRwerk-API-Key fehlt');
		}
		c.set('apiKey', apiKey);
		await next();
	});
