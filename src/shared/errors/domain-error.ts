export type DomainErrorCode =
	| 'VALIDATION_FAILED'
	| 'UNAUTHORIZED'
	| 'NOT_FOUND'
	| 'PROVIDER_NOT_CONFIGURED'
	| 'INVALID_WEBHOOK_SIGNATURE'
	| 'UPSTREAM_ERROR';

/** Fachlicher Fehler mit stabilem Code; die HTTP-Schicht mappt den Code auf einen Status. */
export class DomainError extends Error {
	readonly code: DomainErrorCode;

	constructor(code: DomainErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'DomainError';
		this.code = code;
	}
}
