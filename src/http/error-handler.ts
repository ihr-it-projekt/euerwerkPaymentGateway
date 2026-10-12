import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';
import { DomainError, type DomainErrorCode } from '../shared/errors/domain-error.ts';
import type { Logger } from '../shared/logger/logger.ts';

const STATUS_BY_CODE: Record<DomainErrorCode, ContentfulStatusCode> = {
	VALIDATION_FAILED: 400,
	UNAUTHORIZED: 401,
	NOT_FOUND: 404,
	PROVIDER_NOT_CONFIGURED: 422,
	INVALID_WEBHOOK_SIGNATURE: 400,
	UPSTREAM_ERROR: 502
};

export interface ErrorBody {
	error: { code: DomainErrorCode | 'INTERNAL_ERROR'; message: string; details?: unknown };
}

const toDomainError = (error: unknown): DomainError | null => {
	if (error instanceof DomainError) {
		return error;
	}
	if (error instanceof ZodError) {
		return new DomainError('VALIDATION_FAILED', 'Ungültige Daten', { cause: error });
	}
	return null;
};

/** Zentrales Error-Mapping: DomainError → passender Status, alles andere → 500 ohne Details. */
export const createErrorHandler =
	(logger: Logger) =>
	(error: Error, c: Context): Response => {
		const domainError = toDomainError(error);
		if (!domainError) {
			logger.error('Unbehandelter Fehler', { error: String(error), stack: error.stack });
			const body: ErrorBody = { error: { code: 'INTERNAL_ERROR', message: 'Interner Fehler' } };
			return c.json(body, 500);
		}
		const body: ErrorBody = { error: { code: domainError.code, message: domainError.message } };
		return c.json(body, STATUS_BY_CODE[domainError.code]);
	};
