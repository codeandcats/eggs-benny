import * as commander from 'commander';
import { EggHead, Technology } from '../egghead';
import * as chalk from 'chalk';
import { handleErrorAndExit, getFieldNamesInType, getSubsetOfObject } from '../common';
import { Config, ConfigFieldName, ConfigData } from '../config';
import * as changeCase from 'change-case';

const CONFIG_DATA_FIELD_NAMES = getFieldNamesInType<ConfigData>({ email: 0, password: 0, downloadPath: 0 });

function hasAnyValues(options: ConfigData): boolean {
	return CONFIG_DATA_FIELD_NAMES.reduce((result, fieldName) => {
		return result || options[fieldName] != undefined;
	}, false);
}

function displaySettings(options: ConfigData) {
	const fieldsToDisplay = CONFIG_DATA_FIELD_NAMES
		.map(fieldName => ({
			friendlyName: changeCase.title(fieldName),
			value: fieldName == 'password' ? (options[fieldName] && '********') : options[fieldName]
		}));

	console.log();
	console.log('Settings:');
	console.log();

	for (const field of fieldsToDisplay) {
		console.log(`  ${field.friendlyName}: ${field.value}`);
	}

	console.log();
}

function getUpdatedSettings(existingOptions: ConfigData, newOptions: ConfigData) {
	const result = { ...existingOptions };
	
	for (const fieldName of CONFIG_DATA_FIELD_NAMES) {
		const newValue = newOptions[fieldName];
		if (newValue != undefined) {
			result[fieldName] = newValue;
		}
	}

	return result;
}

function updateSettings(config: Config, options: ConfigData): Promise<void> {
	config.data = getUpdatedSettings(config.data, options);
	
	return config.save().then(() => {
		console.log();
		console.log('Settings updated');
		console.log();
	});
}

commander
	.command('config')
	.description('Configures settings')
	.option('-e, --email <email>')
	.option('-p, --password <password>')
	.option('-d, --download-path <download-path>')
	.action((options: ConfigData) => {
		Config.load().then(config => {
			if (!hasAnyValues(options)) {
				return displaySettings(config.data);
			}

			return updateSettings(config, options);
		});
	});
