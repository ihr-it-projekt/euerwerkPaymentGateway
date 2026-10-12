import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';

const healthRoute = createRoute({
	method: 'get',
	path: '/health',
	tags: ['System'],
	responses: {
		200: {
			description: 'Service ist erreichbar',
			content: { 'application/json': { schema: z.object({ status: z.literal('ok') }) } }
		}
	}
});

export const createHealthRoutes = (): OpenAPIHono =>
	new OpenAPIHono().openapi(healthRoute, (c) => c.json({ status: 'ok' as const }, 200));
