import * as request from 'request';

export interface Item {
	author?: string;
	date?: Date;
	description?: string;
	enclosures?: Enclosure[];
	guid?: string;
	'itunes:duration': {
		'#': string;
	}
	summary?: string;
	title?: string;
}

export interface Enclosure {
	length?: string;
	type?: string;
	url?: string;
}

export async function downloadAndParseRss(url: string): Promise<Item[]> {
	return new Promise<Item[]>((resolve, reject) => {
		const result: Item[] = [];

		const FeedParser = require('feedparser');

		const req = request(url)
		const feedParser = new FeedParser();

		req.on('error', err => {
			reject(err);
		});

		req.on('response', function(res) {
			let stream = this; // `this` is `req`, which is a stream 

			if (res.statusCode !== 200) {
				this.emit('error', new Error('Bad status code'));
			}
			else {
				stream.pipe(feedParser);
			}
		});

		feedParser.on('error', (err: any) => {
			reject(err);
		});

		feedParser.on('readable', function() {
			let stream = this; // `this` is `feedparser`, which is a stream 
			let item;

			while (item = stream.read()) {
				result.push(item);
			}
		});

		feedParser.on('end', () => {
			resolve(result);
		});
	});
}