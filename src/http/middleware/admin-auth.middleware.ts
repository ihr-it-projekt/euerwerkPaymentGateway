import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import { DomainError } from '../../shared/errors/domain-error.ts';
import { extractBearerToken } from './bearer-token.helper.ts';

const safeEquals = (a: string, b: string): boolean => {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	return left.length === right.length && timingSafeEqual(left, right);
};

export const adminAuth = (adminApiKey: string): MiddlewareHandler =>
	createMiddleware(async (c, next) => {
		const token = extractBearerToken(c.req.header('Authorization')) ?? '';
		if (!safeEquals(token, adminApiKey)) {
			throw new DomainError('UNAUTHORIZED', 'Admin-Zugriff verweigert');
		}
		await next();
	});
