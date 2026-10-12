import { DomainError } from '../../shared/errors/domain-error.ts';

export const firstOrNull = <T>(rows: readonly T[]): T | null => rows[0] ?? null;

export const firstOrThrow = <T>(rows: readonly T[], what: string): T => {
	const row = firstOrNull(rows);
	if (row === null) {
		throw new DomainError('NOT_FOUND', `${what} nicht gefunden`);
	}
	return row;
};
