import './promiseShim';
import './commands';

import * as commander from 'commander';
const { version } = require('../package.json');

commander
	.version(version)
	.parse(process.argv);

if (process.argv.length <= 2) {
	commander.help();
}
