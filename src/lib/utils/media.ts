export function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === 'string') {
				resolve(reader.result);
			} else {
				reject(new Error('Unexpected reader result'));
			}
		};
		reader.onerror = () => {
			reject(reader.error);
		};
		reader.readAsDataURL(file);
	});
}

export function mimeTypeForFile(file: File): string {
	const ext = file.name.split('.').pop();
	if (ext === 'jpg' || ext === 'jpeg') {
		return 'image/jpeg';
	}
	if (ext === 'png') {
		return 'image/png';
	}
	throw new Error(`Unsupported file type: ${ext}`);
}

export function matchesMimeType(pattern: string, mimeType: string): boolean {
	if (pattern === '*/*') {
		return true;
	}
	if (pattern === mimeType) {
		return true;
	}

	// Try matching with wildcards
	const [mainType, subType] = pattern.split('/');
	const [mainType2, subType2] = mimeType.split('/');
	const mainMatch = mainType === mainType2 || mainType === '*';
	const subMatch = subType === subType2 || subType === '*';
	return mainMatch && subMatch;
}
