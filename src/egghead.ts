import { UrlOptions } from 'request';
import * as requestPromise from 'request-promise';
import * as cheerio from 'cheerio';
import { fileExists } from './utils/files';
import * as fs from 'mz/fs';
import { downloadAndParseRss } from './utils/rss';

export interface Credentials {
	email: string;
	password: string;
}

export interface HasUserToken {
	userToken: string;
}

const URLS = {
	LOGIN: 'https://egghead.io/users/sign_in',
	COURSES: 'https://egghead.io/courses',
	COURSE_FEED_URL: 'https://egghead.io/courses/{courseCode}/course_feed?user_email={email}&user_token={userToken}',
	MEMBERSHIP: 'https://egghead.io/membership'
};

export class CsrfTokenNotFound extends Error {
	constructor() {
		super('Authentication Failed: Could not find Cross-site Request Forgery token');
	}
}

export class NotAuthenticated extends Error {
	constructor() {
		super('Not authenticated');
	}
}

export interface Technology<TCourse extends Course> {
	name: string;
	courses: TCourse[];
}

export interface Course {
	name: string;
	code: string;
	url: string;
	lessonCount: number;
}

export interface CourseWithLessons<TLesson extends Lesson> extends Course {
	lessons: TLesson[];
}

export interface Lesson {
	name: string;
	lessonNumber: number;
	url: string;
}

export interface LessonWithFileSize extends Lesson {
	fileSize: number;
}

export interface DownloadCallbacks {
	progress?: (downloaded: number, total: number) => void;
	end?: () => void;
}

export interface ProgressCallbacks {
	update: (progress: number, total: number) => void;
}

export interface GetCoursesOptions {
	progress?: ProgressCallbacks;
}

const noop = () => {};

export class EggHead {
	private static readonly defaultOptionsForRequest: requestPromise.RequestPromiseOptions = Object.freeze({
		jar: true,
		gzip: true,
		followRedirect: true,
		followAllRedirects: true,
		headers: {
			'Accept': '*/*',
			'Accept-Language': 'en-GB,en-US;q=0.8,en;q=0.6',
			'User-Agent': 'User-Agent: Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.87 Safari/537.36'
		}
	});

	private authenticatedWithCredentials: (Credentials & HasUserToken) | null = null;
	private request: typeof requestPromise;

	constructor() {
	}

	isAuthenticated() {
		return !!this.authenticatedWithCredentials;
	}

	async authenticate(credentials: Credentials): Promise<void> {
		this.authenticatedWithCredentials = null;
		
		this.request = requestPromise.defaults(EggHead.defaultOptionsForRequest);

		const options: UrlOptions & requestPromise.RequestPromiseOptions = {
			url: URLS.LOGIN,
			headers: {
				'Accept': '*/*',
				'Accept-Encoding': 'gzip, deflate, br',
				'Accept-Language': 'en-GB,en-US;q=0.8,en;q=0.6',
				'Cache-Control': 'max-age=0',
				'Connection': 'keep-alive',
				'Content-Type': 'application/x-www-form-urlencoded',
				'Origin': 'https://egghead.io',
				'Referer': 'https://egghead.io/users/sign_in',
				'Upgrade-Insecure-Requests': '1'
			}
		};
		
		return this.request
			.get({
				url: URLS.LOGIN,
				transform: body => cheerio.load(body),
				transform2xxOnly: true
			})
			.then(($: CheerioStatic) => {
				const csrfToken = $('meta[name="csrf-token"]').attr('content') || '';

				if (!csrfToken) {
					throw new CsrfTokenNotFound();
				}

				return this.request
					.post(URLS.LOGIN, {
						json: true,
						form: {
							'authenticity_token': csrfToken,
							'user[email]': credentials.email,
							'user[password]': credentials.password,
							'utf8': '✓'
						}
					}).then(() => {
						return this.request.get({
							url: URLS.MEMBERSHIP,
							transform: body => cheerio.load(body),
							transform2xxOnly: true
						}).then($ => {
							const userToken = $('input#tech-token').val();
							this.authenticatedWithCredentials = { ...credentials, userToken };
						});
					});
			});
	}

	downloadFile(url: string, fileName: string, progress?: ProgressCallbacks): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const req = this.request.get(url);
			const outputStream = fs.createWriteStream(fileName);

			let total: number;
			let downloaded = 0;
			let errored = false;

			req.on('response', response => {
				total = parseInt(response.headers['content-length'], 10);
			});

			req.on('data', chunk => {
				downloaded += chunk.length;
				if (progress) {
					progress.update(downloaded, total);
				}
			});

			req.on('error', err => {
				errored = true;
				reject(err);
			});

			req.on('end', () => {
				if (!errored) {
					if (progress) {
						progress.update(downloaded, total);
					}
					resolve();
				}
			});

			req.pipe(outputStream);
		});
	}

	async getCourses(options?: GetCoursesOptions) {
		if (!this.authenticatedWithCredentials) {
			throw new NotAuthenticated();
		}

		const progressUpdate = (progress: number, total: number) => {
			if (options && options.progress && options.progress.update) {
				options.progress.update(progress, total);
			}
		};

		return this.request
			.get({
				url: URLS.COURSES,
				transform: body => cheerio.load(body),
				transform2xxOnly: true
			})
			.then(($: CheerioStatic) => {
				const $technologies = $('.jump-into-technologies .technologies-list .item-wrapper');

				const technologies: Technology<Course>[] = [];

				const compareStrings = (a: string, b: string) => a.localeCompare(b);

				$technologies.each((index, technologyElement) => {
					const technology: Technology<Course> = {
						name: $(technologyElement).find('.title').text().trim(),
						courses: []
					};

					const technologyCodeName = $(technologyElement).find('a.anchor-to-technology').attr('data-technology');

					const $courses = $(`#technology-${technologyCodeName}`).find('.card-course .card-content');

					progressUpdate(0, $courses.length);

					$courses.each((index, courseElement) => {
						const codeRegEx = /.*egghead.io\/courses\/(.+)/i;
						const courseUrl = $(courseElement).find('a.link-overlay').attr('href');
						const codeMatch = codeRegEx.exec(courseUrl);
						const course: Course = {
							name: $(courseElement).find('.course-title').text().trim(),
							code: (codeMatch && codeMatch[1]) || '',
							url: $(courseElement).find('a.link-overlay').attr('href'),
							lessonCount: parseInt($(courseElement).find('.lessons-in-course-number-holder .total').text().trim())
						};

						technology.courses.push(course);
					});

					technology.courses.sort((a, b) => compareStrings(a.name, b.name));

					technologies.push(technology);

					progressUpdate(technologies.length, $technologies.length);
				});

				return technologies.sort((a, b) => compareStrings(a.name, b.name));
			});
	}

	private getCourseFeedUrl(course: Course): string {
		if (!this.authenticatedWithCredentials) {
			throw new NotAuthenticated();
		}

		return URLS.COURSE_FEED_URL
			.replace('courseCode', course.code)
			.replace('email', this.authenticatedWithCredentials.email)
			.replace('userToken', this.authenticatedWithCredentials.userToken);
	}

	private getLessonUrl(courseCode: string): string {
		if (!this.authenticatedWithCredentials) {
			throw new NotAuthenticated();
		}

		const url =
			`https://egghead.io/courses/${courseCode}/course_feed` +
			`?user_email=${this.authenticatedWithCredentials.email}` + 
			`&user_token=${this.authenticatedWithCredentials.userToken}`;
		
		return url;
	}

	async getCourseLessons(courseCode: string): Promise<Lesson[]> {
		const url = this.getLessonUrl(courseCode);
		return downloadAndParseRss(url).then(rssItems => {
			const result = rssItems.map((rssItem, index) => ({
				name: rssItem.title || '',
				url: (rssItem.enclosures && rssItem.enclosures.length && rssItem.enclosures[0].url) || '',
				lessonNumber: index + 1
			}));

			return result;
		});
	}
}