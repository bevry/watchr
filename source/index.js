/* @flow */
/* eslint no-use-before-define:0 */
'use strict'

// Imports
const pathUtil = require('path')
const scandir = require('scandirectory')
const fsUtil = require('safefs')
const ignorefs = require('ignorefs')
const extendr = require('extendr')
const eachr = require('eachr')
const { TaskGroup } = require('taskgroup')
const { EventEmitter } = require('events')

/* ::
import type {Stats, FSWatcher} from 'fs'
type StateEnum = "pending" | "active" | "deleted" | "closed"
type MethodEnum = "watch" | "watchFile"
type ErrorCallback = (error: ?Error) => void
type StatCallback = (error: ?Error, stat?: Stats) => void
type WatchChildOpts = {
	fullPath: string,
	relativePath: string,
	stat?: Stats
}
type WatchSelfOpts = {
	errors?: Array<Error>,
	preferredMethods?: Array<MethodEnum>
}
type ListenerOpts = {
	method: MethodEnum,
	args: Array<any>
}
type ResetOpts = {
	reset?: boolean
}
type IgnoreOpts = {
	ignorePaths?: boolean,
	ignoreHiddenFiles?: boolean,
	ignoreCommonPatterns?: boolean,
	ignoreCustomPatterns?: RegExp
}
type WatcherOpts = IgnoreOpts & {
	stat?: Stats,
	interval?: number,
	persistent?: boolean,
	catchupDelay?: number,
	preferredMethods?: Array<MethodEnum>,
	followLinks?: boolean
}
type WatcherConfig = {
	stat: ?Stats,
	interval: number,
	persistent: boolean,
	catchupDelay: number,
	preferredMethods: Array<MethodEnum>,
	followLinks: boolean,
	ignorePaths: false | Array<string>,
	ignoreHiddenFiles: boolean,
	ignoreCommonPatterns: boolean,
	ignoreCustomPatterns: ?RegExp
}
*/

// Helper for error logging
function errorToString (error /* :Error */) {
	return error.stack.toString() || error.message || error.toString()
}

/**
Alias for creating a new {@link Stalker} with some basic configuration
@access public
@param {string} path - the path to watch
@param {function} changeListener - the change listener for {@link Watcher}
@param {function} next - the completion callback for {@link Watcher#watch}
@returns {Stalker}
*/
function open (path /* :string */, changeListener /* :function */, next /* :function */) {
	const stalker = new Stalker(path)
	stalker.on('change', changeListener)
	stalker.watch({}, next)
	return stalker
}

/**
Alias for creating a new {@link Stalker}
@access public
@returns {Stalker}
*/
function create (...args /* :Array<any> */) {
	return new Stalker(...args)
}

/**
Stalker
A watcher of the watchers.
Events that are listened to on the stalker will also be listened to on the attached watcher.
When the watcher is closed, the stalker's listeners will be removed.
When all stalkers for a watcher are removed, the watcher will close.
@protected
@property {Object} watchers - static collection of all the watchers mapped by path
@property {Watcher} watcher - the associated watcher for this stalker
*/
class Stalker extends EventEmitter {
	/* :: static watchers: {[key:string]: Watcher}; */
	/* :: watcher: Watcher; */

	/**
	@param {string} path - the path to watch
	*/
	constructor (path /* :string */) {
		super()

		// Ensure global watchers singleton
		if (Stalker.watchers == null) Stalker.watchers = {}

		// Add our watcher to the singleton
		if (Stalker.watchers[path] == null) Stalker.watchers[path] = new Watcher(path)
		this.watcher = Stalker.watchers[path]

		// Add our stalker to the watcher
		if (this.watcher.stalkers == null) this.watcher.stalkers = []
		this.watcher.stalkers.push(this)

		// If the watcher closes, remove our stalker and the watcher from the singleton
		this.watcher.once('close', () => {
			this.remove()
			delete Stalker.watchers[path]
		})

		// Add the listener proxies
		this.on('newListener', (eventName, listener) => this.watcher.on(eventName, listener))
		this.on('removeListener', (eventName, listener) => this.watcher.removeListener(eventName, listener))
	}

	/**
	Cleanly shutdown the stalker
	@private
	@returns {this}
	*/
	remove () {
		// Remove our stalker from the watcher
		const index = this.watcher.stalkers.indexOf(this)
		if (index !== -1) {
			this.watcher.stalkers = this.watcher.stalkers.slice(0, index).concat(this.watcher.stalkers.slice(index + 1))
		}

		// Kill our stalker
		process.nextTick(() => {
			this.removeAllListeners()
		})

		// Chain
		return this
	}

	/**
	Close the stalker, and if it is the last stalker for the path, close the watcher too
	@access public
	@param {string} [reason] - optional reason to provide for closure
	@returns {this}
	*/
	close (reason /* :?string */) {
		// Remove our stalker
		this.remove()

		// If it was the last stalker for the watcher, or if the path is deleted
		// Then close the watcher
		if (reason === 'deleted' || this.watcher.stalkers.length === 0) {
			this.watcher.close(reason || 'all stalkers are now gone')
		}

		// Chain
		return this
	}

	/**
	Alias for {@link Watcher#setConfig}
	@access public
	@returns {this}
	*/
	setConfig (...args /* :Array<any> */) {
		this.watcher.setConfig(...args)
		return this
	}

	/**
	Alias for {@link Watcher#watch}
	@access public
	@returns {this}
	*/
	watch (...args /* :Array<any> */) {
		this.watcher.watch(...args)
		return this
	}
}

/**
Watcher
Watches a path and if its a directory, its children too, and emits change events for updates, deletions, and creations

Available events:

- `log(logLevel, ...args)` - emitted for debugging, child events are bubbled up
- `close(reason)` - the watcher has been closed, perhaps for a reason
- `change('update', fullPath, currentStat, previousStat)` - an update event has occured on the `fullPath`
- `change('delete', fullPath, currentStat)` - an delete event has occured on the `fullPath`
- `change('create', fullPath, null, previousStat)` - a create event has occured on the `fullPath`

@protected
@property {Array<Stalker>} stalkers - the associated stalkers for this watcher
@property {string} path - the path to be watched
@property {Stats} stat - the stat object for the path
@property {FSWatcher} fswatcher - if the `watch` method was used, this is the FSWatcher instance for it
@property {Object} children - a (relativePath => stalker) mapping of children
@property {string} state - the current state of this watcher
@property {TaskGroup} listenerTaskGroup - the TaskGroup instance for queuing listen events
@property {TimeoutID} listenerTimeout - the timeout result for queuing listen events
@property {Object} config - the configuration options
*/
class Watcher extends EventEmitter {
	/* :: stalkers: Array<Stalker>; */

	/* :: path: string; */
	/* :: stat: null | Stats; */
	/* :: fswatcher: null | FSWatcher; */
	/* :: children: {[path:string]: Stalker}; */
	/* :: state: StateEnum; */
	/* :: listenerTaskGroup: null | TaskGroup; */
	/* :: listenerTimeout: null | TimeoutID; */
	/* :: config: WatcherConfig; */

	/**
	@param {string} path - the path to watch
	*/
	constructor (path /* :string */) {
		// Construct the EventEmitter
		super()

		// Initialise properties
		this.path = path
		this.stat = null
		this.fswatcher = null
		this.children = {}
		this.state = 'pending'
		this.listenerTaskGroup = null
		this.listenerTimeout = null

		// Initialize our configurable properties
		this.config = {
			stat: null,
			interval: 5007,
			persistent: true,
			catchupDelay: 2000,
			preferredMethods: ['watch', 'watchFile'],
			followLinks: true,
			ignorePaths: false,
			ignoreHiddenFiles: false,
			ignoreCommonPatterns: true,
			ignoreCustomPatterns: null
		}
	}

	/**
	Configure out Watcher
	@param {Object} opts - the configuration to use
	@param {Stats} [opts.stat] - A stat object for the path if we already have one, otherwise it will be fetched for us
	@param {number} [opts.interval=5007] - If the `watchFile` method was used, this is the interval to use for change detection if polling is needed
	@param {boolean} [opts.persistent=true] - If the `watchFile` method was used, this is whether or not watching should keep the node process alive while active
	@param {number} [opts.catchupDelay=2000] - This is the delay to wait after a change event to be able to detect swap file changes accurately (without a delay, swap files trigger a delete and creation event, with a delay they trigger a single update event)
	@param {Array<string>} [opts.preferredMethods=['watch', 'watchFile']] - The order of watch methods to attempt, if the first fails, move onto the second
	@param {boolean} [opts.followLinks=true] - If true, will use `fs.stat` instead of `fs.lstat`
	@param {Array<string>} [opts.ignorePaths=false] - Array of paths that should be ignored
	@param {boolean} [opts.ignoreHiddenFiles=false] - Whether to ignore files and directories that begin with a `.`
	@param {boolean} [opts.ignoreCommonPatterns=false] - Whether to ignore common undesirable paths (e.g. `.svn`, `.git`, `.DS_Store`, `thumbs.db`, etc)
	@param {RegExp} [opts.ignoreCustomPatterns] - A regular expression that if matched again the path will ignore the path
	@returns {this}
	*/
	setConfig (opts /* :WatcherOpts */) {
		// Apply
		extendr.extend(this.config, opts)

		// Stat
		if (this.config.stat) {
			this.stat = this.config.stat
			delete this.config.stat
		}

		// Chain
		return this
	}

	/**
	Emit a log event with the given arguments
	@param {Array<*>} args
	@returns {this}
	*/
	log (...args /* :Array<any> */) {
		// Emit the log event
		this.emit('log', ...args)

		// Chain
		return this
	}

	/**
	Fetch the ignored configuration options into their own object
	@private
	@returns {Object}
	*/
	getIgnoredOptions () {
		// Return the ignore options
		return {
			ignorePaths: this.config.ignorePaths,
			ignoreHiddenFiles: this.config.ignoreHiddenFiles,
			ignoreCommonPatterns: this.config.ignoreCommonPatterns,
			ignoreCustomPatterns: this.config.ignoreCustomPatterns
		}
	}

	/**
	Check whether or not a path should be ignored or not based on our current configuration options
	@private
	@param {String} path - the path (likely of a child)
	@returns {boolean}
	*/
	isIgnoredPath (path /* :string */) {
		// Ignore?
		const ignore = ignorefs.isIgnoredPath(path, this.getIgnoredOptions())

		// Return
		return ignore
	}

	/**
	Get the stat for the path of the watcher
	If the stat already exists and `opts.reset` is `false`, then just use the current stat, otherwise fetch a new stat and apply it to the watcher
	@param {Object} opts
	@param {boolean} [opts.reset=false]
	@param  {function} next - completion callback with signature `error:?Error, stat?:Stats`
	@returns {this}
	*/
	getStat (opts /* :ResetOpts */, next /* :StatCallback */) {
		// Figure out what stat method we want to use
		const method = this.config.followLinks ? 'stat' : 'lstat'

		// Fetch
		if (this.stat && opts.reset !== true) {
			next(null, this.stat)
		}
		else {
			fsUtil[method](this.path, (err, stat) => {
				if (err) return next(err)
				this.stat = stat
				return next(null, stat)
			})
		}

		// Chain
		return this
	}

	/**
	Watch and WatchFile Listener
	The listener attached to the `watch` and `watchFile` watching methods.

	Things to note:
	- `watchFile` method:
		- Arguments:
			- currentStat - the updated stat of the changed file
				- Exists even for deleted/renamed files
			- previousStat - the last old stat of the changed file
				- Is accurate, however we already have this
		- For renamed files, it will will fire on the directory and the file
	- `watch` method:
		- Arguments:
			- eventName - either 'rename' or 'change'
				- THIS VALUE IS ALWAYS UNRELIABLE AND CANNOT BE TRUSTED
			- filename - child path of the file that was triggered
				- This value can also be unrealiable at times
	- both methods:
		- For deleted and changed files, it will fire on the file
		- For new files, it will fire on the directory

	Output arguments for your emitted event will be:
	- for updated files the arguments will be: `'update', fullPath, currentStat, previousStat`
	- for created files the arguments will be: `'create', fullPath, currentStat, null`
	- for deleted files the arguments will be: `'delete', fullPath, null, previousStat`

	In the future we will add:
	- for renamed files: 'rename', fullPath, currentStat, previousStat, newFullPath
	- rename is possible as the stat.ino is the same for the delete and create

	@private
	@param {Object} opts
	@param {string} [opts.method] - the watch method that was used
	@param {Array<*>} [opts.args] - the arguments from the watching method
	@param {function} [next] - the optional completion callback with the signature `(error:?Error)`
	@returns {this}
	*/
	listener (opts /* :ListenerOpts */, next /* ::?:ErrorCallback */) {
		// Prepare
		const config = this.config
		const method = opts.method
		if (!next) {
			next = (err) => {
				if (err) {
					this.emit('error', err)
				}
			}
		}

		// Prepare properties
		let currentStat = null
		let previousStat = null

		// Log
		this.log('debug', `watch via ${method} method fired on: ${this.path}`)

		// Delay the execution of the listener tasks, to once the change events have stopped firing
		if (this.listenerTimeout != null) {
			clearTimeout(this.listenerTimeout)
		}
		this.listenerTimeout = setTimeout(() => {
			const tasks = this.listenerTaskGroup
			if (tasks) {
				this.listenerTaskGroup = null
				this.listenerTimeout = null
				tasks.run()
			}
			else {
				this.emit('error', new Error('unexpected state'))
			}
		}, config.catchupDelay || 0)

		// We are a subsequent listener, in which case, just listen to the first listener tasks
		if (this.listenerTaskGroup != null) {
			this.listenerTaskGroup.done(next)
			return this
		}

		// Start the detection process
		const tasks = this.listenerTaskGroup = new TaskGroup(`listener tasks for ${this.path}`, { domain: false }).done(next)
		tasks.addTask('check if the file still exists', (complete) => {
			// Log
			this.log('debug', `watch evaluating on: ${this.path} [state: ${this.state}]`)

			// Check if this is still needed
			if (this.state !== 'active') {
				this.log('debug', `watch discarded on: ${this.path}`)
				tasks.clearRemaining()
				return complete()
			}

			// Check if the file still exists
			fsUtil.exists(this.path, (exists) => {
				// Apply local global property
				previousStat = this.stat

				// If the file still exists, then update the stat
				if (exists === false) {
					// Log
					this.log('debug', `watch emit delete: ${this.path}`)

					// Apply
					this.stat = null
					this.close('deleted')
					this.emit('change', 'delete', this.path, null, previousStat)

					// Clear the remaining tasks, as they are no longer needed
					tasks.clearRemaining()
					return complete()
				}

				// Update the stat of the fil
				this.getStat({ reset: true }, (err, stat) => {
					// Check
					if (err) return complete(err)

					// Update
					currentStat = stat

					// Complete
					return complete()
				})
			})
		})

		tasks.addTask('check if the file has changed', (complete) => {
			// Ensure stats exist
			if (!currentStat || !previousStat) {
				return complete(new Error('unexpected state'))
			}

			// Check if there is a different file at the same location
			// If so, we will need to rewatch the location and the children
			if (currentStat.ino.toString() !== previousStat.ino.toString()) {
				this.log('debug', `watch found replaced: ${this.path}`, currentStat, previousStat)
				// note this will close the entire tree of listeners and reinstate them
				// however, as this is probably for a file, it is probably not that bad
				return this.watch({ reset: true }, complete)
			}

			// Check if the file or directory has been modified
			if (currentStat.mtime.toString() !== previousStat.mtime.toString()) {
				this.log('debug', `watch found modification: ${this.path}`, previousStat, currentStat)
				return complete()
			}

			// Otherwise it is the same, and nothing is needed to be done
			else {
				tasks.clearRemaining()
				return complete()
			}
		})

		tasks.addGroup('check what has changed', (addGroup, addTask, done) => {
			// Ensure stats exist
			if (!currentStat || !previousStat) {
				return done(new Error('unexpected state'))
			}

			// Set this sub group to execute in parallel
			this.setConfig({ concurrency: 0 })

			// So let's check if we are a directory
			if (currentStat.isDirectory() === false) {
				// If we are a file, lets simply emit the change event
				this.log('debug', `watch emit update: ${this.path}`)
				this.emit('change', 'update', this.path, currentStat, previousStat)
				return done()
			}

			// We are a direcotry
			// Chances are something actually happened to a child (rename or delete)
			// and if we are the same, then we should scan our children to look for renames and deletes
			fsUtil.readdir(this.path, (err, newFileRelativePaths) => {
				// Error?
				if (err) return done(err)

				// Log
				this.log('debug', `watch read dir: ${this.path}`, newFileRelativePaths)

				// Find deleted files
				eachr(this.children, (child, childFileRelativePath) => {
					// Skip if the file still exists
					if (newFileRelativePaths.indexOf(childFileRelativePath) !== -1) return

					// Fetch full path
					const childFileFullPath = pathUtil.join(this.path, childFileRelativePath)

					// Skip if ignored file
					if (this.isIgnoredPath(childFileFullPath)) {
						this.log('debug', `watch ignored delete: ${childFileFullPath} via: ${this.path}`)
						return
					}

					// Emit the event and note the change
					this.log('debug', `watch emit delete: ${childFileFullPath} via: ${this.path}`)
					const childPreviousStat = child.watcher.stat
					child.close('deleted')
					this.emit('change', 'delete', childFileFullPath, null, childPreviousStat)
				})

				// Find new files
				eachr(newFileRelativePaths, (childFileRelativePath) => {
					// Skip if we are already watching this file
					if (this.children[childFileRelativePath] != null) return

					// Fetch full path
					const childFileFullPath = pathUtil.join(this.path, childFileRelativePath)

					// Skip if ignored file
					if (this.isIgnoredPath(childFileFullPath)) {
						this.log('debug', `watch ignored create: ${childFileFullPath} via: ${this.path}`)
						return
					}

					// Emit the event and note the change
					addTask('watch the new child', (complete) => {
						this.log('debug', `watch determined create: ${childFileFullPath} via: ${this.path}`)
						if (this.children[childFileRelativePath] != null) {
							return complete()  // this should never occur
						}
						const child = this.watchChild({
							fullPath: childFileFullPath,
							relativePath: childFileRelativePath
						}, (err) => {
							if (err) return complete(err)
							this.emit('change', 'create', childFileFullPath, child.watcher.stat, null)
							return complete()
						})
					})
				})

				// Read the directory, finished adding tasks to the group
				return done()
			})
		})

		// Tasks are executed via the timeout thing earlier

		// Chain
		return this
	}

	/**
	Close the watching abilities of this watcher and its children if it has any
	And mark the state as deleted or closed, dependning on the reason
	@param {string} [reason='unknown']
	@returns {this}
	*/
	close (reason /* :string */ = 'unknown') {
		// Nothing to do? Already closed?
		if (this.state !== 'active') return this

		// Close
		this.log('debug', `close: ${this.path}`)

		// Close our children
		eachr(this.children, (child) => {
			child.close(reason)
		})

		// Close watch listener
		if (this.fswatcher != null) {
			this.fswatcher.close()
			this.fswatcher = null
		}
		else {
			fsUtil.unwatchFile(this.path)
		}

		// Updated state
		if (reason === 'deleted') {
			this.state = 'deleted'
		}
		else {
			this.state = 'closed'
		}

		// Emit our close event
		this.log('debug', `watch closed because ${reason} on ${this.path}`)
		this.emit('close', reason)

		// Chain
		return this
	}

	/**
	Create the child watcher/stalker for a given sub path of this watcher with inherited configuration
	Once created, attach it to `this.children` and bubble `log` and `change` events
	If the child closes, then delete it from `this.children`
	@private
	@param {Object} opts
	@param {string} opts.fullPath
	@param {string} opts.relativePath
	@param {Stats} [opts.stat]
	@param {function} next - completion callback with signature `error:?Error`
	@returns {this}
	*/
	watchChild (opts /* :WatchChildOpts */, next /* :ErrorCallback */) /* :Stalker */ {
		// Prepare
		const watchr = this

		// Create the child
		const child = create(opts.fullPath)

		// Apply the child
		this.children[opts.relativePath] = child

		// Add the extra listaeners
		child.once('close', () => delete watchr.children[opts.relativePath])
		child.on('log', (...args) => watchr.emit('log', ...args))
		child.on('change', (...args) => watchr.emit('change', ...args))

		// Add the extra configuration
		child.setConfig({
			// Custom
			stat: opts.stat,

			// Inherit
			interval: this.config.interval,
			persistent: this.config.persistent,
			catchupDelay: this.config.catchupDelay,
			preferredMethods: this.config.preferredMethods,
			ignorePaths: this.config.ignorePaths,
			ignoreHiddenFiles: this.config.ignoreHiddenFiles,
			ignoreCommonPatterns: this.config.ignoreCommonPatterns,
			ignoreCustomPatterns: this.config.ignoreCustomPatterns,
			followLinks: this.config.followLinks
		})

		// Start the watching
		child.watch(next)

		// Return the child
		return child
	}

	/**
	Read the directory at our given path and watch each child
	@private
	@param {Object} opts - not currently used
	@param {function} next - completion callback with signature `error:?Error`
	@returns {this}
	*/
	watchChildren (opts /* :Object */, next /* :ErrorCallback */) {
		// Prepare
		const watchr = this

		// Check stat
		if (this.stat == null) {
			next(new Error('unexpected state'))
			return this
		}

		// Cycle through the directory if necessary
		const path = this.path
		if (this.stat.isDirectory()) {
			scandir({
				// Path
				path,

				// Options
				ignorePaths: this.config.ignorePaths,
				ignoreHiddenFiles: this.config.ignoreHiddenFiles,
				ignoreCommonPatterns: this.config.ignoreCommonPatterns,
				ignoreCustomPatterns: this.config.ignoreCustomPatterns,
				recurse: false,

				// Next
				next (err, list) {
					if (err) return next(err)
					const tasks = new TaskGroup(`scandir tasks for ${path}`, { domain: false, concurrency: 0 }).done(next)
					Object.keys(list).forEach(function (relativePath) {
						tasks.addTask(function (complete) {
							const fullPath = pathUtil.join(path, relativePath)
							// Check we are still relevant
							if (watchr.state !== 'active') return complete()
							// Watch this child
							watchr.watchChild({ fullPath, relativePath }, complete)
						})
					})
					tasks.run()
				}
			})

		}
		else {
			next()
		}

		// Chain
		return this
	}

	/**
	Setup the watching using the specified method
	@private
	@param {string} method
	@param {function} next - completion callback with signature `error:?Error`
	@returns {void}
	*/
	watchMethod (method /* :MethodEnum */, next /* :ErrorCallback */) /* :void */ {
		if (method === 'watch') {
			// Check
			if (fsUtil.watch == null) {
				const err = new Error('watch method is not supported on this environment, fs.watch does not exist')
				next(err)
				return
			}

			// Watch
			try {
				this.fswatcher = fsUtil.watch(this.path, (...args) => this.listener({ method, args }))
				// must pass the listener here instead of doing fswatcher.on('change', opts.listener)
				// as the latter is not supported on node 0.6 (only 0.8+)
			}
			catch (err) {
				next(err)
				return
			}

			// Success
			next()
			return
		}
		else if (method === 'watchFile') {
			// Check
			if (fsUtil.watchFile == null) {
				const err = new Error('watchFile method is not supported on this environment, fs.watchFile does not exist')
				next(err)
				return
			}

			// Watch
			try {
				fsUtil.watchFile(this.path, {
					persistent: this.config.persistent,
					interval: this.config.interval
				}, (...args) => this.listener({ method, args }))
			}
			catch (err) {
				next(err)
				return
			}

			// Success
			next()
			return
		}
		else {
			const err = new Error('unknown watch method')
			next(err)
			return
		}
	}

	/**
	Setup watching for our path, in the order of the preferred methods
	@private
	@param {Object} opts
	@param {Array<Error>} [opts.errors] - the current errors that we have received attempting the preferred methods
	@param {Array<string>} [opts.preferredMethods] - fallback to the configuration if not specified
	@param {function} next - completion callback with signature `error:?Error`
	@returns {this}
	*/
	watchSelf (opts /* :WatchSelfOpts */, next /* :ErrorCallback */) {
		// Prepare
		const { errors = [] } = opts
		let { preferredMethods = this.config.preferredMethods } = opts
		opts.errors = errors
		opts.preferredMethods = preferredMethods

		// Attempt the watch methods
		if (preferredMethods.length) {
			const method = preferredMethods[0]
			this.watchMethod(method, (err) => {
				if (err) {
					// try again with the next preferred method
					preferredMethods = preferredMethods.slice(1)
					errors.push(err)
					this.watchSelf({ errors, preferredMethods }, next)
					return
				}

				// Apply
				this.state = 'active'

				// Forward
				next()
			})
		}
		else {
			const errors = opts.errors.map((error) => error.stack || error.message || error).join('\n')
			const err = new Error(`no watch methods left to try, failures are:\n${errors}`)
			next(err)
		}

		// Chain
		return this
	}

	/**
	Setup watching for our path, and our children
	If we are already watching and `opts.reset` is not `true` then all done
	Otherwise, close the current watchers for us and the children via {@link Watcher#close} and setup new ones
	@public
	@param {Object} [opts]
	@param {boolean} [opts.reset=false] - should we always close existing watchers and setup new watchers
	@param {function} next - completion callback with signature `error:?Error`
	@param {Array<*>} args - ignore this argument, it is used just to handle the optional `opts` argument
	@returns {this}
	*/
	watch (...args /* :Array<any> */) {
		// Handle overloaded signature
		let opts /* :ResetOpts */, next /* :ErrorCallback */
		if (args.length === 1) {
			opts = {}
			next = args[0]
		}
		else if (args.length === 2) {
			opts = args[0]
			next = args[1]
		}
		else {
			throw new Error('unknown arguments')
		}

		// Check
		if (this.state === 'active' && opts.reset !== true) {
			next()
			return this
		}

		// Close our all watch listeners
		this.close()

		// Log
		this.log('debug', `watch init: ${this.path}`)

		// Fetch the stat then try again
		this.getStat({}, (err) => {
			if (err) return next(err)

			// Watch ourself
			this.watchSelf({}, (err) => {
				if (err) return next(err)

				// Watch the children
				this.watchChildren({}, (err) => {
					if (err) {
						this.close('child failure')
						this.log('debug', `watch failed on [${this.path}] with ${errorToString(err)}`)
					}
					else {
						this.log('debug', `watch success on [${this.path}]`)
					}
					return next(err)
				})
			})
		})

		// Chain
		return this
	}
}

// Now let's provide node.js with our public API
// In other words, what the application that calls us has access to
module.exports = { open, create, Stalker, Watcher }
