import Handlebars from 'handlebars';

export function convertAllStringsToHandlebarSafe(vars: Record<string, unknown>) {
	return Object.fromEntries(
		Object.entries(vars).map(([key, value]) => {
			if (typeof value === 'string') {
				return [key, new Handlebars.SafeString(value)];
			}
			return [key, value];
		})
	);
}
