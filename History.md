## History

- v2.1.2 July 7, 2012
	- Fixed spelling of `persistent`
	- Explicitly set the defaults for the options `ignoreHiddenFiles` and `ignorePatterns`

- v2.1.1 July 7, 2012
	- Added support for `interval` and `persistant` options
	- Improved unlink detection
	- Optimised unlink handling

- v2.1.0 June 22, 2012
	- `watchr.watchr` changes
		- now only accepts one argument which is an object
		- added new `paths` property which is an array of multiple paths to watch
		- will only watch paths that actually exist (before it use to throw an error)
	- Fixed a few bugs
	- Added support for node v0.7/v0.8
	- Moved tests from Mocha to [Joe](https://github.com/bevry/joe)

- v2.0.3 April 19, 2012
	- Fixed a bug with closing watchers
	- Now requires pre-compiled code

- v2.0.0 April 19, 2012
	- Big rewrite
	- Got rid of the delay
	- Now always fires events
	- Watcher instsances inherit from Node's EventEmitter
	- Events for `change`, `unlink` and `new`

- v1.0.0 February 11, 2012
	- Better support for ignoring hidden files
	- Improved documentation, readme
	- Added `History.md` file
	- Added unit tests using [Mocha](http://visionmedia.github.com/mocha/)

- v0.1.0 Nov 13, 2012
	- Initial working version