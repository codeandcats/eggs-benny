# eggs-benny

<p align="center">
	<img src="https://raw.githubusercontent.com/codeandcats/eggs-benny/master/images/logo-small.png">
	<p align="center">
		Downloads <a href="https://egghead.io">egghead.io</a> videos for delicious offline comsumption.
	</p>
</p>

### What's with the name?
"Eggs Benny" is cafe/foodie-slang for [Eggs Benedict](https://www.google.com.au/search?q=eggs+benedict) which is the most delicious of all breakfasts (imho).

## Install
```
npm install eggs-benny -g
```

## Configure
First enter your egghead.io credentials and download directory.
```
eggs-benny config -e <email> -p <password> -d <download-path>
```

## List courses
```
eggs-benny list
```

## Download
To download all lessons in a course
```
eggs-benny download -c "Develop Basic Web Apps with Vue.js"
```

To download all courses in a technology group
```
eggs-benny download -t "Vue.js"
```

To download everything! Warning, this will take a while.
```
eggs-benny download
```

## Command line help
```
eggs-benny --help
```

Help for an individual command
```
eggs-benny --help download
```

## Got an issue/suggestion?
Then please create an [issue](https://github.com/codeandcats/eggs-benny/issues) 😺