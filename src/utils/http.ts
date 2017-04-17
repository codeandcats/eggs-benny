import * as request from 'request';
import Promise = require('bluebird');

export function getFileSize(url: string): PromiseLike<number | null> {
	return new Promise((resolve, reject) => {
		request.head(url, (err, response) => {
			if (err) {
				return reject(err);
			}
			
			const fileSize = parseInt(response.headers['content-length'], 10);

			resolve(fileSize);
		});
	});
}