import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['node_modules/', 'coverage/', 'reports/', 'drizzle/'] },
	js.configs.recommended,
	...tseslint.configs.strictTypeChecked,
	prettier,
	{
		languageOptions: {
			parserOptions: {
				projectService: { allowDefaultProject: ['eslint.config.js', 'prettier.config.js'] },
				tsconfigRootDir: import.meta.dirname
			}
		},
		rules: {
			// Komplexitätsgrenzen – siehe docs/CODE_QUALITY.md
			complexity: ['error', 5],
			'max-depth': ['error', 3],
			'max-params': ['error', 4],
			'max-nested-callbacks': ['error', 3],
			'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
			'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
			'no-nested-ternary': 'error',
			'no-else-return': 'error',
			'no-console': 'error',
			eqeqeq: ['error', 'always'],
			'prefer-const': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/explicit-module-boundary-types': 'error',
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
			'@typescript-eslint/no-unused-vars': [
				'error',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }
			]
		}
	},
	{
		files: ['**/*.spec.ts', 'tests/**/*.ts'],
		rules: {
			'max-lines-per-function': 'off',
			'max-nested-callbacks': ['error', 4],
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-non-null-assertion': 'off'
		}
	},
	{
		files: ['src/index.ts', 'src/infrastructure/db/migrate.ts'],
		rules: { 'no-console': 'off' }
	},
	{
		files: ['*.config.js', '*.config.ts'],
		...tseslint.configs.disableTypeChecked
	}
);
