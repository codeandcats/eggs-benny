import * as path from 'path';
import { deleteFile, ensureDirectoryExists, getFileSize } from '../utils/files';
import * as commander from 'commander';
import { EggHead, Technology, Course, Lesson, LessonWithFileSize, CourseWithLessons, ProgressCallbacks } from '../egghead';
import * as chalk from 'chalk';
import { authenticate, displayCredentialsNotSet, createSpinner, getCourses, handleErrorAndExit, displayDownloadPathNotSet } from '../common';
import { Config } from '../config';
import * as linq from 'linq';
import * as minimatch from 'minimatch';
import { getFileSize as getRemoteFileSize } from '../utils/http';
import Promise = require('bluebird');
const { terminal } = require('terminal-kit');
import formatFileSize = require('filesize');
const CircularJson = require('circular-json');
import pad = require('pad');
import sanitizeFileName = require('sanitize-filename');

const NO_OP = () => {};
const NO_CONCURRENCY = { concurrency: 1 };

commander
	.command('download')
	.option('-t, --technology <technology-name>')
	.option('-c, --course <course-name>')
	.option('-o, --overwrite')
	.option('-n, --no-verify')
	.description('Downloads course(s)')
	.action((cliOptions: CliOptions) => {
		const options = parseOptions(cliOptions);
		
		handleDownloadCommand(options);
	});

export class TechnologyNotFound extends Error {
	constructor(filterName: string) {
		super(`No technology section found named "${filterName}"`);
	}
}

export class CourseNotFound extends Error {
	constructor(filterName: string) {
		super(`No course found named "${filterName}"`);
	}
}

export class FilterNotSpecified extends Error {
	constructor() {
		super('A technology or course name must be specified');
	}
}

function handleDownloadCommand(options: ParsedOptions): PromiseLike<void> {
	return Config.load().then(config => {
		const filter = options.filter;

		if (!config.data.email || !config.data.password) {
			return displayCredentialsNotSet();
		}

		if (!config.data.downloadPath) {
			return displayDownloadPathNotSet();
		}

		const egghead = new EggHead();
		return authenticate(egghead, config.data.email, config.data.password)
			.then(() => getCourses(egghead))
			.then(technologies => {
				if (!filter) {
					return technologies;
				}

				technologies = filterTechnologiesAndCourses(filter, technologies);
				return checkFoundMatchingCourses(filter, technologies);
			})
			.then(technologies => getLessons(egghead, technologies))
			.then((technologies: Technology<CourseWithLessons<LessonWithFileSize>>[]) => {
				displayMatchingCourses(technologies);

				const confirm = (options.noVerify ? Promise.resolve(true) : confirmDownloadCourses(technologies));

				return confirm.then(confirmed => {
					if (!confirmed) {
						return process.exit(0);
					}

					return downloadTechnologies(egghead, technologies, config.data.downloadPath);
				});
			})
			.then(() => {
				console.log(chalk.green('✔ Downloads Finished Successfully'));
				console.log();
			})
			.then(NO_OP);
	})
	.then(() => process.exit(0))
	.catch(handleErrorAndExit);
}

interface CliOptions {
	technology?: string;
	course?: string;
	overwrite: boolean;
	noVerify: boolean;
}

interface ParsedOptions {
	filter: TechnologyFilter | CourseFilter | null;
	overwrite: boolean;
	noVerify: boolean;
}

function parseOptions(options: CliOptions): ParsedOptions {
	const result: ParsedOptions = {
		filter:
			options.technology ? { type: 'technology', name: options.technology } :
			options.course ? { type: 'course', name: options.course } :
			null,
		overwrite: options.overwrite,
		noVerify: options.noVerify
	};

	return result;
}

interface TechnologyFilter {
	type: 'technology',
	name: string;
}

interface CourseFilter {
	type: 'course',
	name: string;
}

function filterTechnologiesAndCourses<TCourse extends Course>(filter: TechnologyFilter | CourseFilter, technologies: Technology<TCourse>[]) {
	if (filter.type === 'technology') {
		return linq
			.from(technologies)
			.where(technology => technology.name.toLowerCase().indexOf(filter.name.toLowerCase()) > -1)
			.toArray();
	} else {
		return linq
			.from(technologies)
			.select(technology => {
				return {
					...technology,
					courses: filterCourses(filter, technology.courses)
				} as Technology<TCourse>;
			})
			.toArray();
	}
}

function filterCourses<TCourse extends Course>(filter: CourseFilter, courses: TCourse[]): TCourse[] {
	return linq
		.from(courses)
		.where(course => course.name.toLowerCase().indexOf(filter.name.toLowerCase()) > -1)
		.toArray();
}

function checkFoundMatchingCourses<TCourse extends Course>(filter: TechnologyFilter | CourseFilter, technologies: Technology<TCourse>[]): Technology<TCourse>[] {
	if (technologies.length == 0) {
		if (filter.type === 'technology') {
			throw new TechnologyNotFound(filter.name);
		} else {
			throw new CourseNotFound(filter.name);
		}
	}

	return technologies;
}

function selectCourses<TCourse extends Course>(technologies: Technology<TCourse>[]) {
	return linq
		.from(technologies)
		.selectMany(technology => technology.courses)
		.toArray();
}

function countLessons(technologies: Technology<Course>[]): number {
	return linq
		.from(technologies)
		.sum(technology => linq
			.from(technology.courses)
			.sum(course => course.lessonCount)
		);
}

function displayMatchingCourses(technologies: Technology<CourseWithLessons<LessonWithFileSize>>[]) {
	const courseCount = selectCourses(technologies).length;

	console.log(`Found ${courseCount} matching courses`);
	console.log();

	let totalDownloadSize = 0;

	for (const technology of technologies) {
		const technologyFileSize = linq
			.from(technology.courses)
			.selectMany(course => course.lessons)
			.sum(lesson => lesson.fileSize);

		totalDownloadSize += technologyFileSize;

		console.log(`${technology.name}` + chalk.yellow(` (${technology.courses.length} courses, ${formatFileSize(technologyFileSize)})`));
		console.log();

		for (const course of technology.courses) {
			const courseFileSize = linq
				.from(course.lessons)
				.sum(lesson => lesson.fileSize);
			
			console.log(` • ${course.name}` + chalk.yellow(` (${course.lessonCount} lessons, ${formatFileSize(courseFileSize)})`));
		}
	}

	console.log();
	console.log(`Total Download Size: ${chalk.yellow(formatFileSize(totalDownloadSize))}`);
}

function confirmDownloadCourses(technologies: Technology<Course>[]): PromiseLike<boolean> {
	return new Promise((resolve, reject) => {
		const courseCount = selectCourses(technologies).length;

		console.log();
		console.log('Download ' + (courseCount == 1 ? 'this course' : `these ${courseCount} courses? [y|n]`));
		console.log();

		terminal.yesOrNo({ yes: ['y', 'Y'], no: ['n', 'N'] }, (err: any, result: any) => {
			return err ? reject(err) : resolve(result);
		});
	});
}

function getLessons<TCourse extends Course>(egghead: EggHead, technologies: Technology<TCourse>[]): PromiseLike<Technology<CourseWithLessons<LessonWithFileSize>>[]> {
	const lessonCount = countLessons(technologies);
	let checkedLessons = 0;

	const spinner = createSpinner(`Retrieving lesson information (0/${lessonCount})...`);

	const MAX_CONCURRENT_FILE_SIZE_REQUESTS = 10;

	return Promise.map(technologies, technology => {
		return Promise.map(technology.courses, course => {
			return getCourseLessons(egghead, course).then(course => {
				return Promise
					.map(course.lessons, lesson => {
						return getLessonFileSize(lesson).then(lesson => {
							checkedLessons++;
							spinner.text = `Retrieving lesson information (${checkedLessons}/${lessonCount})...`;
							return lesson;
						});
					}, { concurrency: MAX_CONCURRENT_FILE_SIZE_REQUESTS })
					.then(lessonsWithFileSizes => {
						const result: CourseWithLessons<LessonWithFileSize> = {
							...course,
							lessons: lessonsWithFileSizes
						};
						return result;
					});
			});
		}, NO_CONCURRENCY).then(courses => {
			return <Technology<CourseWithLessons<LessonWithFileSize>>>{
				...technology,
				courses
			};
		});
	}, NO_CONCURRENCY).then(result => {
		spinner.succeed(`Retrieved lesson information (${checkedLessons}/${lessonCount})`);
		console.log();
		return result;
	}, err => {
		spinner.fail();
		throw err;
	});
}

function getCourseLessons(egghead: EggHead, course: Course): PromiseLike<CourseWithLessons<Lesson>> {
	return egghead
		.getCourseLessons(course.code)
		.then(lessons => Promise.map(lessons, getLessonFileSize, NO_CONCURRENCY))
		.then((lessons: LessonWithFileSize[]) => {
			const result = {
				...course as any,
				lessons
			};
			return result;
		});
}

function getLessonFileSize(lesson: Lesson): PromiseLike<LessonWithFileSize> {
	return getRemoteFileSize(lesson.url).then(fileSize => {
		return <LessonWithFileSize>{
			...lesson,
			fileSize
		};
	});
}

function downloadTechnologies(egghead: EggHead, technologies: Technology<CourseWithLessons<LessonWithFileSize>>[], downloadPath: string): Promise<void> {
	const lessons = linq
		.from(technologies)
		.selectMany(technology => technology.courses.map(course => ({ technology, course })))
		.selectMany(item => item.course.lessons.map(lesson => ({ ...item, lesson })))
		.orderBy(item => item.technology.name)
		.thenBy(item => item.course.name)
		.thenBy(item => item.lesson.lessonNumber)
		.toArray();

	return Promise
		.mapSeries(lessons, ({ technology, course, lesson }, index) => {
			return downloadLesson(egghead, technology, course, lesson, downloadPath, index, lessons.length);
		})
		.then(NO_OP);
}

function checkFileAlreadyDownloaded(fileName: string, expectedFileSize: number): PromiseLike<boolean> {
	return getFileSize(fileName).then(fileSize => {
		if (expectedFileSize != fileSize) {
			return deleteFile(fileName).then(() => false);
		} else {
			return true;
		}
	}, () => {
		return false;
	});
}

function downloadLesson(
	egghead: EggHead,
	technology: Technology<Course>,
	course: Course,
	lesson: LessonWithFileSize,
	downloadPath: string,
	downloadIndex: number,
	downloadCount: number): PromiseLike<void> {

	const technologyPath = getTechnologyPath(downloadPath, technology);
	const coursePath = getCoursePath(technologyPath, course);
	const lessonPath = getLessonFileName(coursePath, lesson);
	
	return ensureDirectoryExists(coursePath).then(() => {
		const lessonFileName = getLessonFileName(coursePath, lesson);

		return checkFileAlreadyDownloaded(lessonFileName, lesson.fileSize).then(alreadyDownloaded => {
			if (alreadyDownloaded) {
				return;
			}

			const UPDATE_INTERVAL = 250;
			
			let downloaded = 0;
			let total = 0;

			function getStatusText(verb: string) {
				return `${verb} ${downloadIndex + 1}/${downloadCount}: ${lesson.name} (${formatFileSize(downloaded)}/${formatFileSize(lesson.fileSize)})`
			}

			const spinner = createSpinner(getStatusText('Downloading'));

			const interval = setInterval(() => {
				spinner.text = getStatusText('Downloading');
			}, UPDATE_INTERVAL);

			const progressOptions: ProgressCallbacks = {
				update: (newDownloaded: number, newTotal: number) => {
					downloaded = newDownloaded;
					total = newTotal;
				}
			};

			return egghead
				.downloadFile(lesson.url, lessonFileName, progressOptions)
				.then(() => {
					clearInterval(interval);
					spinner.succeed(getStatusText('Downloaded'));
					console.log();
				}, err => {
					clearInterval(interval);
					spinner.fail(getStatusText('Failed'));
					console.log();
					throw err;
				});
		});
	});
}

function getTechnologyPath(downloadPath: string, technology: Technology<Course>) {
	return path.join(downloadPath, technology.name);
}

function getCoursePath(technologyPath: string, course: Course) {
	return path.join(technologyPath, course.name);
}

function getLessonFileName(coursePath: string, lesson: Lesson) {
	const lessonNumber = pad(2, lesson.lessonNumber.toString(), '0');
	const fileTitle = sanitizeFileName(`${lessonNumber} ${lesson.name}`, { replacement: ' ' }).replace(/\s+/g, ' ');
	return path.join(coursePath, `${fileTitle}.mp4`);
}
