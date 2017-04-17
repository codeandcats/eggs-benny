import * as path from 'path';
import * as mkdirp from 'mkdirp';
import * as fs from 'mz/fs';

export async function deleteFile(fileName: string): Promise<void> {
	return fs.unlink(fileName);
}

export async function ensureDirectoryExists(directoryPath: string): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		mkdirp(directoryPath, err => err ? reject(err) : resolve());
	});
}

export async function fileExists(fileName: string): Promise<boolean> {
	return fs.stat(fileName).then(stats => stats.isFile(), () => false);
}

export async function getFileSize(fileName: string): Promise<number> {
	return fs.stat(fileName).then(stats => stats.size);
}

export async function readJsonFile<T extends object>(fileName: string, defaultValue: T): Promise<T> {
	const directoryPath = path.parse(fileName).dir;

	return this
		.ensureDirectoryExists(directoryPath)
		.then(() => {
			return fileExists(fileName)
				.then(exists => {
					if (!exists) {
						return defaultValue;
					}

					return fs.readFile(fileName, 'utf8')
						.then(data => data ? JSON.parse(data) as T : {} as T);
				}, () => defaultValue)
				.then(data => data);
		});
}

export async function writeJsonFile(fileName: string, data: any): Promise<void> {
	const content = JSON.stringify(data, null, '\t');

	const directoryPath = path.parse(fileName).dir;

	return this
		.ensureDirectoryExists(directoryPath)
		.then(() => fs.writeFile(fileName, content, 'utf8'));
}
