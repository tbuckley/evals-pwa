export function parseCSV(csv: string) {
	const lines = csv.split('\n');
	const headers = parseCSVLine(lines[0]);

	const data = lines.slice(1).map((line) => {
		const values = parseCSVLine(line);
		const obj = {} as Record<string, string>;
		headers.forEach((header, i) => {
			obj[header] = values[i] || '';
		});
		return obj;
	});
	return data;
}

function parseCSVLine(line: string): string[] {
	const values: string[] = [];
	let currentValue = '';
	let insideQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i];
		if (char === '"') {
			if (insideQuotes && line[i + 1] === '"') {
				// Escaped quote
				currentValue += '"';
				i++; // Skip next quote
			} else {
				insideQuotes = !insideQuotes;
			}
		} else if (char === ',' && !insideQuotes) {
			values.push(currentValue.trim());
			currentValue = '';
		} else {
			currentValue += char;
		}
	}
	values.push(currentValue.trim());
	return values;
}
