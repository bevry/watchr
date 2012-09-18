## Watchr; better file system watching for Node.js

Watchr provides a normalised API the file watching APIs of different node versions, nested/recursive file and directory watching, and accurate detailed events for file/directory changes, deletions and creations.

You install it via `npm istall watchr` and use it via `require('watchr').watch(config)`. Available configuration options are:

- `path` a single path to watch
- `paths` an array of paths to watch
- `listener` a single listener to fire when a change occurs
- `listeners` an array of listeners to fire when a change occurs
- `next` (optional, defaults to `null`) a completion callback to fire once the watchers have been setup
- `stat` (optional, defaults to `null`) a file stat object to use for the path, instead of fetching a new one
- `ignoreHiddenFiles` (optional, defaults to `false`) whether or not to ignored files which filename starts with a `.`
- `ignorePatterns` (optional, defaults to `false`) whether or not to ignore common undesirable file patterns (e.g. `.svn`, `.git`, `.DS_Store`, `thumbs.db`, etc)
- `interval` (optional, defaults to `100`) for systems that poll to detect file changes, how often should it poll in millseconds
- `persistent` (optional, defaults to `true`) whether or not we should keep the node process alive for as long as files are still being watched

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
	},
	next: function(err,watcher){
		if (err)  throw err;
		console.log('watching setup successfully');
	}
});
```

You can test the above code snippet by installing watchr globally by running `npm install -g watchr` to install watchr, then `watchr <pathToWatch>` to watchr a particular path, and performing some file system modifications on that path.

Thanks for using Watchr!


## Support

Support can be found in the [GitHub Issue Tracker](https://github.com/bevry/watchr/issues)


## History

You can discover the history inside the [History.md](https://github.com/bevry/watchr/blob/master/History.md#files) file


## License

Licensed under the incredibly [permissive](http://en.wikipedia.org/wiki/Permissive_free_software_licence) [MIT License](http://creativecommons.org/licenses/MIT/)
<br/>Copyright &copy; 2012 [Bevry Pty Ltd](http://bevry.me)
<br/>Copyright &copy; 2011 [Benjamin Lupton](http://balupton.com)