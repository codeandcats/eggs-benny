import * as chalk from 'chalk';
import { EggHead, Course, Technology } from './egghead';
import ora = require('ora');
const pkg = require('../package.json');

export async function authenticate(egghead: EggHead, email: string, password: string) {
	const spinner = createSpinner('Authenticating...');

	return egghead
		.authenticate({ email, password })
		.then(() => {
			spinner.succeed('Authenticated');
			console.log();
		}, err => {
			spinner.fail();
			console.log();
			return handleErrorAndExit(err);
		});
}

type ActualSpinnerMethods<T> = T & {
	succeed(text?: string): ActualSpinnerMethods<T>;
	fail(text?: string): ActualSpinnerMethods<T>;
	warn(text?: string): ActualSpinnerMethods<T>;
	info(text?: string): ActualSpinnerMethods<T>;
};

function extendSpinner<T>(spinner: T): ActualSpinnerMethods<T> {
	return spinner as any as ActualSpinnerMethods<T>;
}

export function createSpinner(text: string) {
	return extendSpinner(ora({
		text,
		color: 'yellow',
		interval: 25
	}).start());
}

export function displayCredentialsNotSet() {
	console.log(chalk.red(`Email and/or password have not been set.`));
	console.log('');
	console.log(`Please set using: `);
	console.log('');
	console.log(`  ${pkg.name} config -e <email> -p <password>`);
	console.log();
}

export function displayDownloadPathNotSet() {
	console.log(chalk.red('Download path has not been set.'));
	console.log();
	console.log('Please set using: ');
	console.log();
	console.log(`  ${pkg.name} config -d <download-path>`);
	console.log();
}

export async function downloadTechnology(technology: Technology<Course>) {
	throw new Error('Not Yet Implemented');
}

export async function downloadCourse(course: Course) {
	throw new Error('Not Yet Implemented');
}

export async function downloadLesson() {
	throw new Error('Not Yet Implemented');
}

export function handleErrorAndExit(err: any): never {
	console.log(chalk.red(err.message || err));
	process.exit(1);
	throw null;
}

export async function getCourses(egghead: EggHead) {
	const spinner = createSpinner('Retrieving course information...');

	return egghead.getCourses().then(technologies => {
		spinner.succeed('Retrieved course information');
		console.log();
		return technologies;
	}, err => {
		spinner.fail();
		console.log();
		return handleErrorAndExit(err);
	});
}

export function getFieldNamesInType<T>(objectWithFieldNames: { [P in keyof T]: 0 }): Array<keyof T> {
	const result = Object.getOwnPropertyNames(objectWithFieldNames) as Array<keyof T>;
	return result;
}

export function getSubsetOfObject<TInput extends TOutput, TOutput extends object>(data: TInput, fieldNames: (keyof TInput)[]): TOutput {
	const result = {} as any;

	for (const fieldName of fieldNames) {
		result[fieldName] = data[fieldName];
	}

	return result;
}