import type { MiddlewareHandler } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AuthenticateMerchantAction } from '../../domain/merchant/actions/authenticate-merchant.action.ts';
import type { AppEnv } from '../app-env.ts';
import { extractBearerToken } from './bearer-token.helper.ts';

export const merchantAuth = (
	authenticate: Pick<AuthenticateMerchantAction, 'execute'>
): MiddlewareHandler<AppEnv> =>
	createMiddleware<AppEnv>(async (c, next) => {
		const merchant = await authenticate.execute(extractBearerToken(c.req.header('Authorization')));
		c.set('merchant', merchant);
		await next();
	});
