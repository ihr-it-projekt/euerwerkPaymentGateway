import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		expect: { requireAssertions: true },
		restoreMocks: true,
		coverage: {
			provider: 'v8',
			include: ['src/**/*.ts'],
			exclude: ['src/**/*.spec.ts', 'src/index.ts'],
			reporter: ['text', 'html', 'lcov'],
			reportsDirectory: 'reports/coverage',
			thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 }
		},
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					environment: 'node',
					include: ['src/**/*.spec.ts'],
					setupFiles: ['tests/mock-server/vitest.setup.ts']
				}
			},
			{
				extends: true,
				test: {
					name: 'integration',
					environment: 'node',
					include: ['tests/integration/**/*.int.spec.ts'],
					setupFiles: ['tests/mock-server/vitest.setup.ts'],
					testTimeout: 20_000
				}
			}
		]
	}
});
