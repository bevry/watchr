## Watchr

Watchr provides a better and normalised API between Node's 0.4 watchFile and 0.6's fsWatcher.

You install it via `npm istall watchr`, use it via `require('watchr').watch(config)`. Configuration properties can be:

- `path` a single path to watch,
- `paths` an array of paths to watch
- `listener` a single listener to fire when a change occurs
- `listeners` an array of listeners to fire when a change occurs
- `next` (optional) a completion callback to fire once the watchers have been setup
- `stat` (optional) a file stat object to use for the path, instead of fetching a new one
- `ignoreHiddenFiles` (optional) whether or not to ignored hidden files
- `ignorePatterns` (optional) whether or not to ignore common undesirable file patterns

 Listeners will be triggered whenever a change is made on the directory or for anything inside it (including sub-directories and so on) and are in the following format `var listener = function(eventName,filePath,fileCurrentStat,filePreviousStat){}`

There are three types of events for your listeners at your disposal:

- `change`: a file has been modified
- `new`: a new file or directory has been created
- `unlink`: a file or a directory has been removed

To wrap it all together, it would look like this:

``` javascript
// Require
watchr = require('watchr')

// Watch a directory or file
watchr.watch({
	path: path,
	listener: function(eventName,filePath,fileCurrentStat,filePreviousStat){
		console.log('a watch event occured:',arguments);
	}
});
```

You can test the above code snippet by installing watchr globally by running `npm install -g watchr` to install watchr, then `watchr [pathToWatch]` to watchr a particular path, and performing some file system modifications on that path.

Thanks for using Watchr!


## Support

Support can be found in the [GitHub Issue Tracker](https://github.com/bevry/watchr/issues)


## History

You can discover the history inside the [History.md](https://github.com/bevry/watchr/blob/master/History.md#files) file


## License

Licensed under the [MIT License](http://creativecommons.org/licenses/MIT/)
<br/>Copyright &copy; 2012 [Bevry Pty Ltd](http://bevry.me)
<br/>Copyright &copy; 2011 [Benjamin Lupton](http://balupton.com)