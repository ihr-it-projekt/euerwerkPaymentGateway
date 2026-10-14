import { describe, expect, it, vi } from 'vitest';
import { buildPaymentConfig } from '#tests/factories/config.factory.ts';
import { GetProvidersAction } from './get-providers.action.ts';

describe('GetProvidersAction', () => {
	it.each([
		[buildPaymentConfig(), ['stripe', 'paypal', 'wero']],
		[buildPaymentConfig({ paypal: null }), ['stripe', 'wero']],
		[buildPaymentConfig({ stripe: null, wero: null }), ['paypal']]
	])('liefert nur eingerichtete Zahlungsarten (%#)', async (config, expected) => {
		const load = vi.fn(() => Promise.resolve(config));

		const result = await new GetProvidersAction({ load }).execute('ewk_live_key');

		expect(result).toEqual({ providers: expected });
		expect(load).toHaveBeenCalledWith('ewk_live_key');
	});
});
