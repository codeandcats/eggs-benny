import * as chalk from 'chalk';

export function handleErrorAndExit(err: any): never {
	console.log(chalk.red(err.message || err));
	process.exit(1);
	throw null;
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