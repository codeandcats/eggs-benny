import { UrlOptions } from 'request';
import * as requestPromise from 'request-promise';
import * as cheerio from 'cheerio';

export interface Credentials {
	emailAddress: string;
	password: string;
}

const URLS = {
	LOGIN: 'https://egghead.io/users/sign_in',
	COURSES: 'https://egghead.io/courses'
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

export interface Technology {
	name: string;
	courses: Course[];
}

export interface Course {
	name: string;
	url: string;
	lessonCount: number;
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

	private authenticated = false;
	private request: typeof requestPromise;

	constructor() {
	}

	isAuthenticated() {
		return this.authenticated;
	}

	async authenticate(credentials: Credentials): Promise<void> {
		this.authenticated = false;
		
		this.request = requestPromise.defaults(EggHead.defaultOptionsForRequest);

		const options: UrlOptions & requestPromise.RequestPromiseOptions = {
			url: URLS.LOGIN,
			headers: {
				'Accept': '*/*',
				'Accept-Encoding': 'gzip, deflate, br',
				'Accept-Language': 'en-GB,en-US;q=0.8,en;q=0.6',
				'Cache-Control': 'max-age=0',
				'Connection': 'keep-alive',
				'Content-Length': '202',
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
							'user[email]': credentials.emailAddress,
							'user[password]': credentials.password,
							'utf8': '✓'
						}
					}).then(() => {
						this.authenticated = true;
					});
			});
	}

	private checkIsAuthenticated() {
		if (!this.isAuthenticated()) {
			throw new NotAuthenticated();
		}
	}

	async getCourses() {
		this.checkIsAuthenticated();

		return this.request
			.get({
				url: URLS.COURSES,
				transform: body => cheerio.load(body),
				transform2xxOnly: true
			})
			.then(($: CheerioStatic) => {
				const $technologies = $('.jump-into-technologies .technologies-list .item-wrapper');

				const technologies: Technology[] = [];

				const compareStrings = (a: string, b: string) => a.localeCompare(b);

				$technologies.each((index, technologyElement) => {
					const technology: Technology = {
						name: $(technologyElement).find('.title').text().trim(),
						courses: []
					};

					const technologyCodeName = $(technologyElement).find('a.anchor-to-technology').attr('data-technology');

					const $courses = $(`#technology-${technologyCodeName}`).find('.card-course .card-content');

					$courses.each((index, courseElement) => {
						const course: Course = {
							name: $(courseElement).find('.course-title').text().trim(),
							url: $(courseElement).find('a.link-overlay').attr('href'),
							lessonCount: parseInt($(courseElement).find('.lessons-in-course-number-holder .total').text().trim())
						};

						technology.courses.push(course);
					});

					technology.courses.sort((a, b) => compareStrings(a.name, b.name));

					technologies.push(technology);
				});

				return technologies.sort((a, b) => compareStrings(a.name, b.name));
			});
	}
}