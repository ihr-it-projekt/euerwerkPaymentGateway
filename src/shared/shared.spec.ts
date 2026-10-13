import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnv } from '../config/env.ts';
import { extractBearerToken } from '../http/middleware/bearer-token.helper.ts';
import { createJsonLogger, silentLogger } from './logger/logger.ts';
import { formatMinorUnits } from './money/format-minor-units.helper.ts';

describe('formatMinorUnits', () => {
	it.each([
		[0, '0.00'],
		[5, '0.05'],
		[1999, '19.99'],
		[100000, '1000.00']
	])('%i → %s', (minor, expected) => {
		expect(formatMinorUnits(minor)).toBe(expected);
	});
});

describe('extractBearerToken', () => {
	it.each([
		['Bearer abc', 'abc'],
		['bearer abc', 'abc'],
		['Basic abc', undefined],
		['Bearer', undefined],
		[undefined, undefined]
	])('%s → %s', (header, expected) => {
		expect(extractBearerToken(header)).toBe(expected);
	});
});

describe('createJsonLogger', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('schreibt eine JSON-Zeile pro Eintrag', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		createJsonLogger().warn('Achtung', { checkoutId: 'c1' });

		const line = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
		expect(line).toMatchObject({ level: 'warn', message: 'Achtung', checkoutId: 'c1' });
	});

	it('silentLogger schreibt nichts', () => {
		const spy = vi.spyOn(console, 'info');

		silentLogger.info('nichts');

		expect(spy).not.toHaveBeenCalled();
	});
});

describe('loadEnv', () => {
	const valid = {
		PUBLIC_BASE_URL: 'http://localhost:3100',
		ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
		EUERWERK_API_BASE: 'http://localhost:5173/api/v1'
	};

	it('setzt Defaults für optionale Werte', () => {
		expect(loadEnv(valid)).toMatchObject({
			PORT: 3100,
			PAYPAL_API_BASE: 'https://api-m.sandbox.paypal.com'
		});
	});

	it('bricht bei zu kurzem ENCRYPTION_KEY ab', () => {
		expect(() =>
			loadEnv({ ...valid, ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') })
		).toThrow(/32 Byte/);
	});
});
