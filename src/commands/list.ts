import * as commander from 'commander';
import { EggHead, Technology, Course } from '../egghead';
import * as chalk from 'chalk';
import { authenticate, createSpinner, getCourses, handleErrorAndExit, displayCredentialsNotSet } from '../common';
import { Config } from '../config';
const pkg = require('../../package.json');

commander
	.command('list')
	.description('Lists all courses')
	.action(() => {
		console.log();

		Config.load().then(config => {
			if (!config.data.email || !config.data.password) {
				return displayCredentialsNotSet();
			}

			const egghead = new EggHead();

			return authenticate(egghead, config.data.email, config.data.password)
				.then(() => getCourses(egghead))
				.then(technologies => listCourses(technologies));
		});
	});

function listCourses(technologies: Technology<Course>[]) {
	const allCourses = technologies
		.map(technology => technology.courses)
		.reduce((result, courses) => result.concat(courses), []);
	
	const totalLessonCount = allCourses
		.map(course => course.lessonCount)
		.reduce((total, count) => total + count, 0);

	console.log('Course Listing: ' + chalk.yellow(`${totalLessonCount} lessons over ${allCourses.length} courses over ${technologies.length} technologies`));
	console.log();
	
	for (const technology of technologies) {
		console.log(chalk.bold(technology.name) + chalk.yellow(` (${technology.courses.length} courses)`));
		console.log();
		for (const course of technology.courses) {
			console.log(` • ${course.name}` + chalk.yellow(` (${course.lessonCount} lessons)`));
		}
		console.log();
	}
}