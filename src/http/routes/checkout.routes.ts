import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import type { AuthenticateMerchantAction } from '../../domain/merchant/actions/authenticate-merchant.action.ts';
import type { CreateCheckoutAction } from '../../domain/checkout/actions/create-checkout.action.ts';
import type { GetCheckoutAction } from '../../domain/checkout/actions/get-checkout.action.ts';
import { toCheckoutView } from '../../domain/checkout/helpers/to-checkout-view.helper.ts';
import { CreateCheckoutInputSchema } from '../../domain/checkout/models/checkout.schema.ts';
import type { AppEnv } from '../app-env.ts';
import { merchantAuth } from '../middleware/merchant-auth.middleware.ts';
import { validationHook } from '../validation-hook.ts';
import {
	CheckoutIdParamSchema,
	CheckoutViewSchema,
	ErrorResponseSchema,
	errorResponses
} from '../schemas/api.schemas.ts';

export interface CheckoutRouteActions {
	authenticate: Pick<AuthenticateMerchantAction, 'execute'>;
	createCheckout: Pick<CreateCheckoutAction, 'execute'>;
	getCheckout: Pick<GetCheckoutAction, 'execute'>;
}

const json = <T>(schema: T) => ({ 'application/json': { schema } });

const createCheckoutRoute = createRoute({
	method: 'post',
	path: '/',
	tags: ['Checkouts'],
	summary: 'Checkout anlegen und Weiterleitungs-URL zum Zahlungsanbieter erhalten',
	security: [{ Bearer: [] }],
	request: { body: { content: json(CreateCheckoutInputSchema), required: true } },
	responses: {
		201: { description: 'Checkout angelegt', content: json(CheckoutViewSchema) },
		...errorResponses,
		422: { description: 'Provider nicht konfiguriert', content: json(ErrorResponseSchema) },
		502: { description: 'Fehler beim Zahlungsanbieter', content: json(ErrorResponseSchema) }
	}
});

const getCheckoutRoute = createRoute({
	method: 'get',
	path: '/{id}',
	tags: ['Checkouts'],
	summary: 'Checkout-Status abfragen',
	security: [{ Bearer: [] }],
	request: { params: CheckoutIdParamSchema },
	responses: {
		200: { description: 'Checkout', content: json(CheckoutViewSchema) },
		...errorResponses,
		404: { description: 'Nicht gefunden', content: json(ErrorResponseSchema) }
	}
});

export const createCheckoutRoutes = (actions: CheckoutRouteActions): OpenAPIHono<AppEnv> => {
	const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });
	app.use('*', merchantAuth(actions.authenticate));

	return app
		.openapi(createCheckoutRoute, async (c) => {
			const checkout = await actions.createCheckout.execute(c.get('merchant'), c.req.valid('json'));
			return c.json(toCheckoutView(checkout), 201);
		})
		.openapi(getCheckoutRoute, async (c) => {
			const checkout = await actions.getCheckout.execute(
				c.get('merchant').id,
				c.req.valid('param').id
			);
			return c.json(toCheckoutView(checkout), 200);
		});
};
