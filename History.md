## History

- v2.1.6 November 6, 2012
	- Added missing `bin` configuration
		- Fixes [#16](https://github.com/bevry/watchr/issues/16) thanks to [pull request #17](https://github.com/bevry/watchr/pull/17) by [Robson Roberto Souza Peixoto](https://github.com/robsonpeixoto)

- v2.1.5 September 29, 2012
	- Fixed completion callback not firing when trying to watch a path that doesn't exist

- v2.1.4 September 27, 2012
	- Fixed new listeners not being added for directories that have already been watched
	- Fixed completion callbacks happening too soon
	- Thanks to [pull request #14](https://github.com/bevry/watchr/pull/14) by [Casey Foster](https://github.com/caseywebdev)

- v2.1.3 August 10, 2012
	- Re-added markdown files to npm distribution as they are required for the npm website

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