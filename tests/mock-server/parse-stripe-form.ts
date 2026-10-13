type Node = Record<string, unknown>;

const child = (node: Node, key: string): Node => {
	node[key] ??= {};
	return node[key] as Node;
};

const assign = (target: Node, path: string[], value: string): void => {
	const parent = path.slice(0, -1).reduce(child, target);
	parent[path.at(-1) ?? ''] = value;
};

/** Objekte mit numerischen Schlüsseln ("0","1",…) → Arrays (Stripe-Form-Encoding). */
const normalize = (value: unknown): unknown => {
	if (typeof value !== 'object' || value === null) return value;
	const entries = Object.entries(value).map(([key, inner]) => [key, normalize(inner)] as const);
	const isArray = entries.length > 0 && entries.every(([key]) => /^\d+$/.test(key));
	return isArray ? entries.map(([, inner]) => inner) : Object.fromEntries(entries);
};

/** `line_items[0][price_data][unit_amount]=100` → `{ line_items: [{ price_data: { unit_amount: '100' } }] }` */
export const parseStripeForm = (text: string): Node => {
	const result: Node = {};
	for (const [key, value] of new URLSearchParams(text)) {
		assign(result, key.replace(/\]/g, '').split('['), value);
	}
	return normalize(result) as Node;
};
