/* eslint no-console:0, no-use-before-define:0, no-sync:0 */
// Require the node.js path module
// This provides us with what we need to interact with file paths
const pathUtil = require('path')

// Require our helper modules
const scandir = require('scandirectory')
const fsUtil = require('safefs')
const ignorefs = require('ignorefs')
const extendr = require('extendr')
const eachr = require('eachr')
const extractOpts = require('extract-opts')
const typeChecker = require('typechecker')
const {TaskGroup} = require('taskgroup')
const watchrUtil = require('./util')

// Require the node.js event emitter
// This provides us with the event system that we use for binding and trigger events
const {EventEmitter} = require('events')

/*
Now to make watching files more convient and managed, we'll create a class which we can use to attach to each file.
It'll provide us with the API and abstraction we need to accomplish difficult things like recursion.
We'll also store a global store of all the watchers and their paths so we don't have multiple watchers going at the same time
for the same file - as that would be quite ineffecient.
Events:
- `log` for debugging, receives the arguments `logLevel, ...args`
- `error` for gracefully listening to error events, receives the arguments `err`
- `watching` for when watching of the path has completed, receives the arguments `err, watcherInstance, isWatching`
- `change` for listening to change events, receives the arguments `changeType, fullPath, currentStat, previousStat`
*/
let watchersTotal = 0
const watchers = {}
class Watcher extends EventEmitter {
	// Now it's time to construct our watcher
	// We give it a path, and give it some events to use
	// Then we get to work with watching it
	constructor (opts, next) {
		// Extract options
		[opts, next] = extractOpts(opts, next)

		// Construct the EventEmitter
		super()

		// The path this class instance is attached to
		this.path = null

		// Our stat object, it contains things like change times, size, and is it a directory
		this.stat = null

		// The node.js file watcher instance, we have to open and close this, it is what notifies us of the events
		this.fswatcher = null

		// The watchers for the children of this watcher will go here
		// This is for when we are watching a directory, we will scan the directory and children go here
		this.children = {}

		// We have to store the current state of the watcher and it is asynchronous (things can fire in any order)
		// as such, we don't want to be doing particular things if this watcher is deactivated
		// valid states are: pending, active, closed, deleted
		this.state = 'pending'

		// The method we will use to watch the files
		// Preferably we use watchFile, however we may need to use watch in case watchFile doesn't exist (e.g. windows)
		this.method = null

		// Things for this.listener
		this.listenerTasks = null
		this.listenerTimeout = null

		// Initialize our object variables for our instance
		this.config = {
			// A single path to watch
			path: null,

			// Listener (optional, detaults to null)
			// single change listener, forwaded to this.listen
			listener: null,

			// Listeners (optional, defaults to null)
			// multiple event listeners, forwarded to this.listen
			listeners: null,

			// Stat (optional, defaults to `null`)
			// a file stat object to use for the path, instead of fetching a new one
			stat: null,

			// Should we output log messages?
			outputLog: false,

			// Interval (optional, defaults to `5007`)
			// for systems that poll to detect file changes, how often should it poll in millseconds
			// if you are watching a lot of files, make this value larger otherwise you will have huge memory load
			// only appliable to the `watchFile` watching method
			interval: 5007,

			// Persistent (optional, defaults to `true`)
			// whether or not we should keep the node process alive for as long as files are still being watched
			// only appliable to the `watchFile` watching method
			persistent: true,

			// Catchup Delay (optional, defaults to `1000`)
			// Because of swap files, the original file may be deleted, and then over-written with by moving a swap file in it's place
			// Without a catchup delay, we would report the original file's deletion, and ignore the swap file changes
			// With a catchup delay, we would wait until there is a pause in events, then scan for the correct changes
			catchupDelay: 2 * 1000,

			// Preferred Methods (optional, defaults to `['watch','watchFile']`)
			// In which order should use the watch methods when watching the file
			preferredMethods: ['watch', 'watchFile'],

			// Follow symlinks, i.e. use stat rather than lstat. (optional, default to `true`)
			followLinks: true,

			// Ignore Paths (optional, defaults to `false`)
			// array of paths that we should ignore
			ignorePaths: false,

			// Ignore Hidden Files (optional, defaults to `false`)
			// whether or not to ignored files which filename starts with a `.`
			ignoreHiddenFiles: false,

			// Ignore Common Patterns (optional, defaults to `true`)
			// whether or not to ignore common undesirable file patterns (e.g. `.svn`, `.git`, `.DS_Store`, `thumbs.db`, etc)
			ignoreCommonPatterns: true,

			// Ignore Custom PAtterns (optional, defaults to `null`)
			// any custom ignore patterns that you would also like to ignore along with the common patterns
			ignoreCustomPatterns: null
		}

		// Setup our instance with the configuration
		if ( opts )  this.setConfig(opts)

		// Start the watch setup
		if ( next )  this.watch(next)
	}

	// Set our configuration
	setConfig (opts) {
		// Apply
		extendr.extend(this.config, opts)

		// Path
		this.path = this.config.path

		// Stat
		if ( this.config.stat ) {
			this.stat = this.config.stat
			this.isDirectory = this.stat.isDirectory()
			delete this.config.stat
		}

		// Listeners
		if ( this.config.listener || this.config.listeners ) {
			this.removeAllListeners()
			if ( this.config.listener ) {
				this.listen(this.config.listener)
				delete this.config.listener
			}
			if ( this.config.listeners ) {
				this.listen(this.config.listeners)
				delete this.config.listeners
			}
		}

		// Chain
		return this
	}

	// Log
	log (...args) {
		// Output the log?
		if ( this.config.outputLog === true )  console.log(...args)

		// Emit the log
		this.emit('log', ...args)

		// Chain
		return this
	}

	// Get Ignored Options
	getIgnoredOptions (opts = {}) {
		// Prepare
		const config = this.config

		// Return the ignore options
		return {
			ignorePaths: opts.ignorePaths == null ? config.ignorePaths : opts.ignorePaths,
			ignoreHiddenFiles: opts.ignoreHiddenFiles == null ? config.ignoreHiddenFiles : opts.ignoreHiddenFiles,
			ignoreCommonPatterns: opts.ignoreCommonPatterns == null ? config.ignoreCommonPatterns : opts.ignoreCommonPatterns,
			ignoreCustomPatterns: opts.ignoreCustomPatterns == null ? config.ignoreCustomPatterns : opts.ignoreCustomPatterns
		}
	}

	// Is Ignored Path
	isIgnoredPath (path, opts) {
		// Ignore?
		const ignore = ignorefs.isIgnoredPath(path, this.getIgnoredOptions(opts))

		// Log
		this.log('debug', `ignore: ${path} ${ignore ? 'yes' : 'no'}`)

		// Return
		return ignore
	}

	// Get the latest stat object
	// next(err, stat)
	getStat (next) {
		// Figure out what stat method we want to use
		const method = this.config.followLinks ? 'stat' : 'lstat'

		// Fetch
		fsUtil[method](this.path, next)

		// Chain
		return this
	}

	// Is Directory
	isDirectory () {
		// Return is directory
		return this.stat.isDirectory()
	}

	// Before we start watching, we'll have to setup the functions our watcher will need

	// Bubble
	// We need something to bubble events up from a child file all the way up the top
	bubble (...args) {
		// Log
		// this.log('debug', `bubble on ${this.path} with the args:`, args)

		// Trigger
		this.emit(...args)

		// Chain
		return this
	}

	// Bubbler
	// Setup a bubble wrapper
	bubbler (eventName) {
		// Return bubbler
		return (...args) => this.bubble(eventName, ...args)
	}

	/*
	Listen
	Add listeners to our watcher instance.
	Overloaded to also accept the following:
	- `changeListener` a single change listener
	- `[changeListener]` an array of change listeners
	- `{eventName:eventListener}` an object keyed with the event names and valued with a single event listener
	- `{eventName:[eventListener]}` an object keyed with the event names and valued with an array of event listeners
	*/
	listen (eventName, listener) {
		// Prepare
		const watchr = this

		// Check format
		if ( listener == null ) {
			// Alias
			const listeners = eventName

			// Array of change listeners
			if ( typeChecker.isArray(listeners) ) {
				eachr(listeners, function (listener) {
					watchr.listen('change', listener)
				})
			}

			// Object of event listeners
			else if ( typeChecker.isPlainObject(listeners) ) {
				eachr(listeners, function (listenerArray, eventName) {
					// Array of event listeners
					if ( typeChecker.isArray(listenerArray) ) {
						eachr(listenerArray, function (listener) {
							watchr.listen(eventName, listener)
						})
					}
					// Single event listener
					else {
						watchr.listen(eventName, listenerArray)
					}
				})
			}

			// Single change listener
			else {
				watchr.listen('change', listeners)
			}
		}
		else {
			// Listen
			watchr.removeListener(eventName, listener)
			watchr.on(eventName, listener)
			watchr.log('debug', `added a listener: on ${watchr.path} for event ${eventName}`)
		}

		// Chain
		return this
	}

	/*
	Listener
	A change event has fired

	Things to note:
	- watchFile method
		- Arguments
			- currentStat - the updated stat of the changed file
				- Exists even for deleted/renamed files
			- previousStat - the last old stat of the changed file
				- Is accurate, however we already have this
		- For renamed files, it will will fire on the directory and the file
	- watch method
		- Arguments
			- eventName - either 'rename' or 'change'
				- THIS VALUE IS ALWAYS UNRELIABLE AND CANNOT BE TRUSTED
			- filename - child path of the file that was triggered
				- This value can also be unrealiable at times
	- Both methods
		- For deleted and changed files, it will fire on the file
		- For new files, it will fire on the directory

	Output arguments for your emitted event will be:
	- for updated files the arguments will be: `'update', fullPath, currentStat, previousStat`
	- for created files the arguments will be: `'create', fullPath, currentStat, null`
	- for deleted files the arguments will be: `'delete', fullPath, null, previousStat`

	In the future we will add:
	- for renamed files: 'rename', fullPath, currentStat, previousStat, newFullPath
	- rename is possible as the stat.ino is the same for the delete and create
	*/
	listener (opts, next) {
		[opts, next] = extractOpts(opts, next)

		// Prepare
		const watchr = this
		const config = this.config

		// Prepare properties
		let currentStat = null
		const previousStat = watchr.stat

		// Log
		watchr.log('debug', `Watch triggered on: ${watchr.path}`)

		// Delay the execution of the listener tasks, to once the change events have stopped firing
		if ( watchr.listenerTimeout != null ) {
			clearTimeout(watchr.listenerTimeout)
		}
		watchr.listenerTimeout = setTimeout(function () {
			const listenerTasks = watchr.listenerTasks
			watchr.listenerTasks = null
			watchr.listenerTimeout = null
			listenerTasks.run()
		}, config.catchupDelay || 0)

		// We are a subsequent listener, in which case, just listen to the first listener tasks
		if ( watchr.listenerTasks != null ) {
			if ( next )  watchr.listenerTasks.done(next)
			return this
		}

		// Start the detection process
		const tasks = watchr.listenerTasks = new TaskGroup().done(function (err) {
			watchr.listenersExecuting -= 1
			if ( err )  watchr.emit('error', err)
			if ( next )  return next(err)
		})

		tasks.addTask('check if the file still exists', function (complete) {
			// Log
			watchr.log('debug', `Watch followed through on: ${watchr.path}`)

			// Check if the file still exists
			fsUtil.exists(watchr.path, function (exists) {
				// Apply local gobal property
				const fileExists = exists

				// If the file still exists, then update the stat
				if ( fileExists === false ) {
					// Log
					watchr.log('debug', `Determined delete: ${watchr.path}`)

					// Apply
					watchr.close('deleted')
					watchr.stat = null

					// Clear the remaining tasks, as they are no longer needed
					tasks.clearRemaining()
					return complete()
				}

				// Update the stat of the file
				watchr.getStat(function (err, stat) {
					// Check
					if ( err )  return watchr.emit('error', err)

					// Update
					currentStat = watchr.stat = stat

					// If there is a new file at the same path as the old file, then recreate the watchr
					if ( watchr.stat.birthtime !== previousStat.birthtime ) {
						createWatcher(this, complete)
					}
					else {
						// Get on with it
						return complete()
					}
				})
			})
		})

		tasks.addTask('check if the file has changed', function () {
			// Check if it is the same
			// as if it is, then nothing has changed, so ignore
			if ( watchrUtil.statChanged(previousStat, currentStat) === false ) {
				watchr.log('debug', `Determined same: ${watchr.path}`, previousStat, currentStat)

				// Clear the remaining tasks, as they are no longer needed
				tasks.clearRemaining()
			}
		})

		tasks.addGroup('check what has changed', function (addGroup, addTask, complete) {
			// Set this sub group to execute in parallel
			this.setConfig({concurrency: 0})

			// So let's check if we are a directory
			if ( watchr.isDirectory() === false ) {
				// If we are a file, lets simply emit the change event
				watchr.log('debug', `Determined update: ${watchr.path}`)
				watchr.emit('change', 'update', watchr.path, currentStat, previousStat)
				return complete()
			}

			// We are a direcotry
			// Chances are something actually happened to a child (rename or delete)
			// and if we are the same, then we should scan our children to look for renames and deletes
			fsUtil.readdir(watchr.path, function (err, newFileRelativePaths) {
				// Error?
				if ( err )  return complete(err)

				// The watch method is fast, but not reliable, so let's be extra careful about change events
				if ( watchr.method === 'watch' ) {
					eachr(watchr.children, function (childFileWatcher, childFileRelativePath) {
						// Skip if the file has been deleted
						if ( newFileRelativePaths.indexOf(childFileRelativePath) === -1 )  return
						if ( !childFileWatcher )  return
						tasks.addTask(function (complete) {
							watchr.log('debug', `Forwarding extensive change detection to child: ${childFileRelativePath} via: ${watchr.path}`)
							childFileWatcher.listener(null, complete)
						})
					})
				}

				// Find deleted files
				eachr(watchr.children, function (childFileWatcher, childFileRelativePath) {
					// Skip if the file still exists
					if ( newFileRelativePaths.indexOf(childFileRelativePath) !== -1 )  return

					// Fetch full path
					const childFileFullPath = pathUtil.join(watchr.path, childFileRelativePath)

					// Skip if ignored file
					if ( watchr.isIgnoredPath(childFileFullPath) ) {
						watchr.log('debug', `Ignored delete: ${childFileFullPath} via: ${watchr.path}`)
						return
					}

					// Emit the event and note the change
					watchr.log('debug', `Determined delete: ${childFileFullPath} via: ${watchr.path}`)
					watchr.closeChild(childFileRelativePath, 'deleted')
				})

				// Find new files
				eachr(newFileRelativePaths, function (childFileRelativePath) {
					// Skip if we are already watching this file
					if ( watchr.children[childFileRelativePath] != null )  return
					watchr.children[childFileRelativePath] = false  // reserve this file

					// Fetch full path
					const childFileFullPath = pathUtil.join(watchr.path, childFileRelativePath)

					// Skip if ignored file
					if ( watchr.isIgnoredPath(childFileFullPath) ) {
						watchr.log('debug', `Ignored create: ${childFileFullPath} via: ${watchr.path}`)
						return
					}

					// Emit the event and note the change
					addTask(function (complete) {
						watchr.log('debug', `Determined create: ${childFileFullPath} via: ${watchr.path}`)
						watchr.watchChild({
							fullPath: childFileFullPath,
							relativePath: childFileRelativePath,
							next (err, childFileWatcher) {
								if ( err )  return complete(err)
								watchr.emit('change', 'create', childFileFullPath, childFileWatcher.stat, null)
								return complete()
							}
						})
					})
				})

				// Read the directory, finished adding tasks to the group
				return complete()
			})
		})

		// Tasks are executed via the timeout thing earlier

		// Chain
		return this
	}

	/*
	Close
	We will need something to close our listener for removed or renamed files
	As renamed files are a bit difficult we will want to close and delete all the watchers for all our children too
	Essentially it is a self-destruct
	*/
	close (reason) {
		// Prepare
		const watchr = this

		// Nothing to do? Already closed?
		if ( watchr.state !== 'active' )  return this

		// Close
		watchr.log('debug', `close: ${watchr.path}`)

		// Close our children
		eachr(watchr.children, function (childRelativePath) {
			watchr.closeChild(childRelativePath, reason)
		})

		// Close watchFile listener
		if ( watchr.method === 'watchFile' ) {
			fsUtil.unwatchFile(watchr.path)
		}

		// Close watch listener
		if ( watchr.fswatcher != null ) {
			watchr.fswatcher.close()
			watchr.fswatcher = null
		}

		// Updated state
		if ( reason === 'deleted' ) {
			watchr.state = 'deleted'
			watchr.emit('change', 'delete', watchr.path, null, watchr.stat)
		}
		else if ( reason === 'failure' ) {
			watchr.state = 'closed'
			watchr.log('warn', `Failed to watch the path ${watchr.path}`)
		}
		else {
			watchr.state = 'closed'
		}

		// Delete our watchers reference
		if ( watchers[watchr.path] != null ) {
			delete watchers[watchr.path]
			watchersTotal--
		}

		// Chain
		return this
	}

	// Close a child
	closeChild (fileRelativePath, reason) {
		// Prepare
		const watchr = this

		// Check
		if ( watchr.children[fileRelativePath] != null ) {
			const watcher = watchr.children[fileRelativePath]
			if ( watchr ) {  // could be `false` for reservation
				watcher.close(reason)
			}
			delete watchr.children[fileRelativePath]
		}

		// Chain
		return this
	}

	/*
	Watch Child
	Setup watching for a child
	Bubble events of the child into our instance
	Also instantiate the child with our instance's configuration where applicable
	next(err, watchr)
	*/
	watchChild (opts, next) {
		[opts, next] = extractOpts(opts, next)

		// Prepare
		const watchr = this
		const config = this.config

		// Check if we are already watching
		if ( watchr.children[opts.relativePath] ) {
			// Provide the existing watcher
			if ( next ) {
				next(null, watchr.children[opts.relativePath])
			}
		}
		else {
			// Create a new watcher for the child
			watchr.children[opts.relativePath] = watch({
				// Custom
				path: opts.fullPath,
				stat: opts.stat,
				listeners: {
					'log': watchr.bubbler('log'),
					'error': watchr.bubbler('error'),
					change (...args) {
						const [changeType, path] = args
						if ( changeType === 'delete' && path === opts.fullPath ) {
							watchr.closeChild(opts.relativePath, 'deleted')
						}
						watchr.bubble('change', ...args)
					}
				},
				next,

				// Inherit
				outputLog: config.outputLog,
				interval: config.interval,
				persistent: config.persistent,
				catchupDelay: config.catchupDelay,
				preferredMethods: config.preferredMethods,
				ignorePaths: config.ignorePaths,
				ignoreHiddenFiles: config.ignoreHiddenFiles,
				ignoreCommonPatterns: config.ignoreCommonPatterns,
				ignoreCustomPatterns: config.ignoreCustomPatterns,
				followLinks: config.followLinks
			})
		}

		// Return the watchr
		return watchr.children[opts.relativePath]
	}

	/*
	Watch Children
	next(err, watching)
	*/
	watchChildren (next) {
		// Prepare
		const watchr = this
		const config = this.config

		// Cycle through the directory if necessary
		if ( watchr.isDirectory() ) {
			scandir({
				// Path
				path: watchr.path,

				// Options
				ignorePaths: config.ignorePaths,
				ignoreHiddenFiles: config.ignoreHiddenFiles,
				ignoreCommonPatterns: config.ignoreCommonPatterns,
				ignoreCustomPatterns: config.ignoreCustomPatterns,
				recurse: false,

				// Next
				next (err) {
					const watching = !err
					return next(err, watching)
				},

				// File and Directory Actions
				action (fullPath, relativePath, nextFile) {
					// Check we are still releveant
					if ( watchr.state !== 'active' ) {
						return nextFile(null, true)  // skip without error
					}

					// Watch this child
					watchr.watchChild({fullPath, relativePath}, function (err) {
						return nextFile(err)
					})
				}
			})

		}
		else {
			next(null, true)
		}

		// Chain
		return this
	}

	/*
	Watch Self
	next(err, watching)
	*/
	watchSelf (next) {
		// Prepare
		const watchr = this
		const config = this.config

		// Reset the method
		watchr.method = null

		// Try the watch
		watchrUtil.watchMethods({
			path: watchr.path,
			methods: config.preferredMethods,
			persistent: config.persistent,
			interval: config.interval,
			listener () {
				return watchr.listener()
			},
			next (err, success, method, fswatcher) {
				// Check
				watchr.fswatcher = fswatcher
				if ( err )  watchr.emit('error', err)

				// Error?
				if ( !success ) {
					watchr.close('failure')
					return next(null, false)
				}

				// Apply
				watchr.method = method
				watchr.state = 'active'

				// Forward
				return next(null, true)
			}
		})

		// Chain
		return this
	}

	/*
	Watch
	Setup the native watching handlers for our path so we can receive updates on when things happen
	If the next argument has been received, then add it is a once listener for the watching event
	If we are already watching this path then let's start again (call close)
	If we are a directory, let's recurse
	If we are deleted, then don't error but return the isWatching argument of our completion callback as false
	Once watching has completed for this directory and all children, then emit the watching event
	next(err, watchr, watching)
	*/
	watch (next) {
		// Prepare
		const watchr = this

		// Prepare
		function complete (err, watching) {
			// Prepare
			if ( typeof err === 'undefined' )  err = null
			if ( watching == null )  watching = true

			// Failure
			if ( err || !watching ) {
				watchr.close()
				if ( next )  next(err, watchr, false)
				watchr.emit('watching', err,  watchr, false)
			}

			// Success
			else {
				if ( next )  next(null, watchr, true)
				watchr.emit('watching', null, watchr, true)
			}
		}

		// Ensure Stat
		if ( watchr.stat == null ) {
			// Fetch the stat
			watchr.getStat(function (err, stat) {
				// Error
				if ( err || !stat )  return complete(err, false)

				// Apply
				watchr.stat = stat

				// Recurse
				return watchr.watch(next)
			})

			// Chain
			return this
		}

		// Close our all watch listeners
		watchr.close()

		// Log
		watchr.log('debug', `watch: ${this.path}`)

		// Watch ourself
		watchr.watchSelf(function (err, watching) {
			if ( err || !watching )  return complete(err, watching)

			// Watch the childrne
			watchr.watchChildren(function (err, watching) {
				return complete(err, watching)
			})
		})

		// Chain
		return this
	}
}

/*
Create Watcher
Checks to see if the path actually exists, if it doesn't then exit gracefully
If it does exist, then lets check our cache for an already existing watcher instance
If we have an already existing watching instance, then just add our listeners to that
If we don't, then create a watching instance
Fire the next callback once done
opts = {path, listener, listeners}
opts = watcher instance
next(err,watcherInstance)
*/
function createWatcher (opts, next) {
	// Prepare
	[opts, next] = extractOpts(opts, next)

	// Only create a watchr if the path exists
	if ( fsUtil.existsSync(opts.path) === false ) {
		if ( next )  next(null, null)
		return
	}

	// Should we clone a watcher instance?
	// By copying relevant configuration, closing the old watcher, and creating a new
	if ( opts instanceof Watcher ) {
		opts.close()
		opts = extendr.extend({}, opts.config, {
			listener: opts.listener,
			listeners: opts.listeners
		})
		// continue to create a new, watchers[opts.path] should be deleted now due to opts.close
	}

	// Use existing
	let watcher = null
	if ( watchers[opts.path] != null ) {
		// We do, so let's use that one instead
		watcher = watchers[opts.path]

		// and add the new listeners if we have any
		if ( opts.listener )  watcher.listen(opts.listener)
		if ( opts.listeners )  watcher.listen(opts.listeners)

		// as we don't create a new watcher, we must fire the next callback ourselves
		if ( next )  next(null, watcher)
	}
	// Create a new one
	else {
		// We don't, so let's create a new one
		let attempt = 0
		watcher = new Watcher(opts, function (err) {
			// Continue if we passed
			if ( !err || attempt !== 0 ) {
				if ( next )  return next(err, watcher)
			}
			attempt++

			// Log
			watcher.log('debug', 'Preferred method failed, trying methods in reverse order', err)

			// Otherwise try again with the other preferred method
			watcher
				.setConfig({
					preferredMethods: watcher.config.preferredMethods.reverse()
				})
				.watch()
		})

		// Save the watcher
		watchers[opts.path] = watcher
		watchersTotal++
	}

	// Return
	return watcher
}

/*
Watch
Provides an abstracted API that supports multiple paths
If you are passing in multiple paths then do not rely on the return result containing all of the watchers
you must rely on the result inside the completion callback instead
If you used the paths option, then your results will be an array of watcher instances, otherwise they will be a single watcher instance
next(err,results)
*/
function watch (opts, next) {
	// Prepare
	[opts, next] = extractOpts(opts, next)

	// Prepare
	let result = []

	// Check paths as that is handled by us
	if ( opts.paths ) {
		// Extract it and delte it from the opts
		const paths = opts.paths
		delete opts.paths

		// Check its format
		if ( typeChecker.isArray(paths) ) {
			// Prepare
			const tasks = new TaskGroup({concurrency: 0}).whenDone(function (err) {
				if ( next )  next(err, result)
			})
			paths.forEach(function (path) {
				tasks.addTask(function (complete) {
					const localOpts = extendr.extend({}, opts, {path})
					const watcher = createWatcher(localOpts, complete)
					if ( watcher ) {
						result.push(watcher)
					}
				})
			})
			tasks.run()
		}

		// Paths is actually a single path
		else {
			opts.path = paths
			result.push(createWatcher(opts, function (err) {
				if ( next )  next(err, result)
			}))
		}
	}

	// Single path
	else {
		result = createWatcher(opts, next)
	}

	// Return
	return result
}

// Now let's provide node.js with our public API
// In other words, what the application that calls us has access to
module.exports = {watch, Watcher}
