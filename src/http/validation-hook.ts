import type { Context } from 'hono';
import type { ZodError } from 'zod';
import type { ErrorBody } from './error-handler.ts';

type ValidationResult = { success: true } | { success: false; error: ZodError };

/** Einheitliches Fehlerformat für Request-Validierung (statt Hono-Default). */
export const validationHook = (result: ValidationResult, c: Context): Response | undefined => {
	if (result.success) {
		return undefined;
	}
	const body: ErrorBody = {
		error: {
			code: 'VALIDATION_FAILED',
			message: 'Ungültige Daten',
			details: result.error.issues.map(({ path, message }) => ({ path, message }))
		}
	};
	return c.json(body, 400);
};
