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
