import { readJsonFile, writeJsonFile } from './utils/files';
import * as path from 'path';
const pkg = require('../package.json');

const appDataPath =
	process.env.APPDATA || (process.platform == 'darwin' ?
	path.join(process.env.HOME, 'Library/Preferences') :
	'/var/local');

const configFileName = path.join(appDataPath, pkg.name, 'config.json');

export interface ConfigData {
	email: string;
	password: string;
	downloadPath: string;
}

export type ConfigFieldName = keyof ConfigData;

export class Config {
	static async load(): Promise<Config> {
		const defaultValue: ConfigData = {
			email: '',
			password: '',
			downloadPath: ''
		};

		return readJsonFile(configFileName, defaultValue)
			.then(data => new Config(data));
	}

	constructor(public data: ConfigData) {
	}

	save(): Promise<void> {
		return writeJsonFile(configFileName, this.data);
	}
}
