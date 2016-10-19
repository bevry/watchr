/* @flow */
/* eslint no-use-before-define:0 */

// Imports
const pathUtil = require('path')
const scandir = require('scandirectory')
const fsUtil = require('safefs')
const ignorefs = require('ignorefs')
const extendr = require('extendr')
const eachr = require('eachr')
const {TaskGroup} = require('taskgroup')
const {EventEmitter} = require('events')

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
	ignorePaths: boolean,
	ignoreHiddenFiles: boolean,
	ignoreCommonPatterns: boolean,
	ignoreCustomPatterns: ?RegExp
}
*/

function errorToString (error /* :Error */) {
	return error.stack.toString() || error.message || error.toString()
}

/**
Stalker - A watcher of the watchers
@constructor
@class Stalker
@extends EventEmitter
@access public
*/
class Stalker extends EventEmitter {
	/* :: static watchers: {[key:string]: Watcher} */
	/* :: watcher: Watcher */
	constructor (path /* :string */) {
		super()

		// Ensure global watchers singleton
		if ( Stalker.watchers == null )  Stalker.watchers = {}

		// Add our watcher to the singleton
		if ( Stalker.watchers[path] == null )  Stalker.watchers[path] = new Watcher(path)
		this.watcher = Stalker.watchers[path]

		// Add our stalker to the watcher
		if ( this.watcher.stalkers == null )  this.watcher.stalkers = []
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

	remove () {
		// Remove our stalker from the watcher
		const index = this.watcher.stalkers.indexOf(this)
		if ( index !== -1 ) {
			this.watcher.stalkers = this.watcher.stalkers.slice(0, index).concat(this.watcher.stalkers.slice(index + 1))
		}

		// Kill our stalker
		process.nextTick(() => {
			this.removeAllListeners()
		})

		// Chain
		return this
	}

	close (reason /* :?string */) {
		// Remove our stalker
		this.remove()

		// If it was the last stalker for the watcher, or if the path is deleted
		// Then close the watcher
		if ( reason === 'deleted' || this.watcher.stalkers.length === 0 ) {
			this.watcher.close(reason || 'all stalkers are now gone')
		}

		// Chain
		return this
	}

	setConfig (...args /* :Array<any> */) {
		this.watcher.setConfig(...args)
		return this
	}

	watch (...args /* :Array<any> */) {
		this.watcher.watch(...args)
		return this
	}
}

function open (path /* :string */, changeListener /* :function */, next /* :function */) {
	const stalker = new Stalker(path)
	stalker.on('change', changeListener)
	stalker.watch({}, next)
}

function create (...args /* :Array<any> */) {
	return new Stalker(...args)
}

/*
Now to make watching files more convient and managed, we'll create a class which we can use to attach to each file.
It'll provide us with the API and abstraction we need to accomplish difficult things like recursion.
We'll also store a global store of all the watchers and their paths so we don't have multiple watchers going at the same time
for the same file - as that would be quite ineffecient.
Events:
- `close` for when the watcher stops watching
- `change` for listening to change events, receives the arguments `changeType, fullPath, currentStat, previousStat`
*/
class Watcher extends EventEmitter {
	/* :: stalkers: Array<Stalker> */

	/* :: path: string */
	/* :: stat: null | Stats */
	/* :: fswatcher: null | FSWatcher */
	/* :: children: {[path:string]: Stalker} */
	/* :: state: StateEnum */
	/* :: method: null | MethodEnum */
	/* :: listenerTaskGroup: null | TaskGroup */
	/* :: listenerTimeout: null | number */
	/* :: config: WatcherConfig */

	// Now it's time to construct our watcher
	// We give it a path, and give it some events to use
	// Then we get to work with watching it
	constructor (path /* :string */) {
		// Construct the EventEmitter
		super()

		// Apply the path, as this should never change after construction
		this.path = path

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
		this.listenerTaskGroup = null
		this.listenerTimeout = null

		// Initialize our object variables for our instance
		this.config = {
			// Stat (optional, defaults to `null`)
			// a file stat object to use for the path, instead of fetching a new one
			stat: null,

			// Interval (optional, defaults to `5007`)
			// for systems that poll to detect file changes, how often should it poll in millseconds
			// if you are watching a lot of files, make this value larger otherwise you will have huge memory load
			// only applicable to the `watchFile` watching method
			interval: 5007,

			// Persistent (optional, defaults to `true`)
			// whether or not we should keep the node process alive for as long as files are still being watched
			// only applicable to the `watchFile` watching method
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

			// Ignore Custom Patterns (optional, defaults to `null`)
			// any custom ignore patterns that you would also like to ignore along with the common patterns
			ignoreCustomPatterns: null
		}
	}

	// Set our configuration
	setConfig (opts /* :WatcherOpts */) {
		// Apply
		extendr.extend(this.config, opts)

		// Stat
		if ( this.config.stat ) {
			this.stat = this.config.stat
			delete this.config.stat
		}

		// Chain
		return this
	}

	// Log
	log (...args /* :Array<any> */) {
		// Emit the log event
		this.emit('log', ...args)

		// Chain
		return this
	}

	// Get Ignored Options
	getIgnoredOptions (opts /* :IgnoreOpts */ = {}) {
		// Return the ignore options
		return {
			ignorePaths: opts.ignorePaths != null
				? opts.ignorePaths
				: this.config.ignorePaths,
			ignoreHiddenFiles: opts.ignoreHiddenFiles != null
				? opts.ignoreHiddenFiles
				: this.config.ignoreHiddenFiles,
			ignoreCommonPatterns: opts.ignoreCommonPatterns != null
				? opts.ignoreCommonPatterns
				: this.config.ignoreCommonPatterns,
			ignoreCustomPatterns: opts.ignoreCustomPatterns != null
				? opts.ignoreCustomPatterns
				: this.config.ignoreCustomPatterns
		}
	}

	// Is Ignored Path
	isIgnoredPath (path /* :string */, opts /* :IgnoreOpts */ = {}) {
		// Ignore?
		const ignore = ignorefs.isIgnoredPath(path, this.getIgnoredOptions(opts))

		// Return
		return ignore
	}

	// Get the stat object
	// next(err, stat)
	getStat (opts /* :ResetOpts */, next /* :StatCallback */) {
		// Figure out what stat method we want to use
		const method = this.config.followLinks ? 'stat' : 'lstat'

		// Fetch
		if ( this.stat && opts.reset !== true ) {
			next(null, this.stat)
		}
		else {
			fsUtil[method](this.path, (err, stat) => {
				if ( err )  return next(err)
				this.stat = stat
				return next(null, stat)
			})
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
	listener (opts /* :ListenerOpts */, next /* ::?:ErrorCallback */) {
		// Prepare
		const config = this.config
		const method = opts.method
		if ( !next ) {
			next = (err) => {
				if ( err ) {
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
		if ( this.listenerTimeout != null ) {
			clearTimeout(this.listenerTimeout)
		}
		this.listenerTimeout = setTimeout(() => {
			const tasks = this.listenerTaskGroup
			if ( tasks ) {
				this.listenerTaskGroup = null
				this.listenerTimeout = null
				tasks.run()
			}
			else {
				this.emit('error', new Error('unexpected state'))
			}
		}, config.catchupDelay || 0)

		// We are a subsequent listener, in which case, just listen to the first listener tasks
		if ( this.listenerTaskGroup != null ) {
			this.listenerTaskGroup.done(next)
			return this
		}

		// Start the detection process
		const tasks = this.listenerTaskGroup = new TaskGroup(`listener tasks for ${this.path}`, {domain: false}).done(next)
		tasks.addTask('check if the file still exists', (complete) => {
			// Log
			this.log('debug', `watch evaluating on: ${this.path} [state: ${this.state}]`)

			// Check if this is still needed
			if ( this.state !== 'active' ) {
				this.log('debug', `watch discarded on: ${this.path}`)
				tasks.clearRemaining()
				return complete()
			}

			// Check if the file still exists
			fsUtil.exists(this.path, (exists) => {
				// Apply local global property
				previousStat = this.stat

				// If the file still exists, then update the stat
				if ( exists === false ) {
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
				this.getStat({reset: true}, (err, stat) => {
					// Check
					if ( err )  return complete(err)

					// Update
					currentStat = stat

					// Complete
					return complete()
				})
			})
		})

		tasks.addTask('check if the file has changed', (complete) => {
			// Ensure stats exist
			if ( !currentStat || !previousStat ) {
				return complete(new Error('unexpected state'))
			}

			// Check if there is a different file at the same location
			// If so, we will need to rewatch the location and the children
			if ( currentStat.ino.toString() !== previousStat.ino.toString() ) {
				this.log('debug', `watch found replaced: ${this.path}`, currentStat, previousStat)
				// note this will close the entire tree of listeners and reinstate them
				// however, as this is probably for a file, it is probably not that bad
				return this.watch({reset: true}, complete)
			}

			// Check if the file or directory has been modified
			if ( currentStat.mtime.toString() !== previousStat.mtime.toString() ) {
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
			if ( !currentStat || !previousStat ) {
				return done(new Error('unexpected state'))
			}

			// Set this sub group to execute in parallel
			this.setConfig({concurrency: 0})

			// So let's check if we are a directory
			if ( currentStat.isDirectory() === false ) {
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
				if ( err )  return done(err)

				// Log
				this.log('debug', `watch read dir: ${this.path}`, newFileRelativePaths)

				// Find deleted files
				eachr(this.children, (child, childFileRelativePath) => {
					// Skip if the file still exists
					if ( newFileRelativePaths.indexOf(childFileRelativePath) !== -1 )  return

					// Fetch full path
					const childFileFullPath = pathUtil.join(this.path, childFileRelativePath)

					// Skip if ignored file
					if ( this.isIgnoredPath(childFileFullPath) ) {
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
					if ( this.children[childFileRelativePath] != null )  return

					// Fetch full path
					const childFileFullPath = pathUtil.join(this.path, childFileRelativePath)

					// Skip if ignored file
					if ( this.isIgnoredPath(childFileFullPath) ) {
						this.log('debug', `watch ignored create: ${childFileFullPath} via: ${this.path}`)
						return
					}

					// Emit the event and note the change
					addTask('watch the new child', (complete) => {
						this.log('debug', `watch determined create: ${childFileFullPath} via: ${this.path}`)
						if ( this.children[childFileRelativePath] != null ) {
							return complete()  // this should never occur
						}
						const child = this.watchChild({
							fullPath: childFileFullPath,
							relativePath: childFileRelativePath
						}, (err) => {
							if ( err )  return complete(err)
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

	/*
	Close
	We will need something to close our listener for removed or renamed files
	As renamed files are a bit difficult we will want to close and delete all the watchers for all our children too
	Essentially it is a self-destruct
	*/
	close (reason /* :string */ = 'unknown reason') {
		// Nothing to do? Already closed?
		if ( this.state !== 'active' )  return this

		// Close
		this.log('debug', `close: ${this.path}`)

		// Close our children
		eachr(this.children, (child) => {
			child.close(reason)
		})

		// Close watch listener
		if ( this.fswatcher != null ) {
			this.fswatcher.close()
			this.fswatcher = null
		}
		else {
			fsUtil.unwatchFile(this.path)
		}

		// Updated state
		if ( reason === 'deleted' ) {
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

	/*
	Watch Child
	Setup watching for a child
	Bubble events of the child into our instance
	Also instantiate the child with our instance's configuration where applicable
	next(err)
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

	/*
	Watch Children
	next(err)
	*/
	watchChildren (opts /* :Object */, next /* :ErrorCallback */) {
		// Prepare
		const watchr = this

		// Check stat
		if ( this.stat == null ) {
			next(new Error('unexpected state'))
			return this
		}

		// Cycle through the directory if necessary
		if ( this.stat.isDirectory() ) {
			scandir({
				// Path
				path: this.path,

				// Options
				ignorePaths: this.config.ignorePaths,
				ignoreHiddenFiles: this.config.ignoreHiddenFiles,
				ignoreCommonPatterns: this.config.ignoreCommonPatterns,
				ignoreCustomPatterns: this.config.ignoreCustomPatterns,
				recurse: false,

				// Next
				next,

				// File and Directory Actions
				action (fullPath, relativePath, nextFile) {
					// Check we are still releveant
					if ( watchr.state !== 'active' ) {
						return nextFile(null, true)  // skip without error
					}

					// Watch this child
					watchr.watchChild({fullPath, relativePath}, nextFile)
				}
			})

		}
		else {
			next()
		}

		// Chain
		return this
	}

	// Setup the methods
	// next(err)
	watchMethod (method /* :MethodEnum */, next /* :ErrorCallback */) /* :void */ {
		if ( method === 'watch' ) {
			// Check
			if ( fsUtil.watch == null ) {
				const err = new Error('watch method is not supported on this environment, fs.watch does not exist')
				next(err)
				return
			}

			// Watch
			try {
				this.fswatcher = fsUtil.watch(this.path, (...args) => this.listener({method, args}))
				// must pass the listener here instead of doing fswatcher.on('change', opts.listener)
				// as the latter is not supported on node 0.6 (only 0.8+)
			}
			catch ( err ) {
				next(err)
				return
			}

			// Success
			next()
			return
		}
		else if ( method === 'watchFile' ) {
			// Check
			if ( fsUtil.watchFile == null ) {
				const err = new Error('watchFile method is not supported on this environment, fs.watchFile does not exist')
				next(err)
				return
			}

			// Watch
			try {
				fsUtil.watchFile(this.path, {
					persistent: this.config.persistent,
					interval: this.config.interval
				}, (...args) => this.listener({method, args}))
			}
			catch ( err ) {
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

	/*
	Watch Self
	next(err)
	*/
	watchSelf (opts /* :WatchSelfOpts */, next /* :ErrorCallback */) {
		// Prepare
		const {errors = []} = opts
		let {preferredMethods = this.config.preferredMethods} = opts
		opts.errors = errors
		opts.preferredMethods = preferredMethods

		// Attempt the watch methods
		if ( preferredMethods.length ) {
			const method = preferredMethods[0]
			this.watchMethod(method, (err) => {
				if ( err ) {
					// try again with the next preferred method
					preferredMethods = preferredMethods.slice(1)
					errors.push(err)
					this.watchSelf({errors, preferredMethods}, next)
					return
				}

				// Apply
				this.method = method
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

	/*
	Watch
	Setup the native watching handlers for our path so we can receive updates on when things happen
	If the next argument has been received, then add it is a once listener for the watching event
	If we are already watching this path then let's start again (call close)
	If we are a directory, let's recurse
	If we are deleted, then don't error but return the isWatching argument of our completion callback as false
	Once watching has completed for this directory and all children, then emit the watching event
	next(err)
	*/
	watch (...args /* :Array<any> */) {
		// Handle overloaded signature
		let opts /* :{reset?: boolean} */, next /* :(err:?Error) => void */
		if ( args.length === 1 ) {
			opts = {}
			next = args[0]
		}
		else if ( args.length === 2 ) {
			opts = args[0]
			next = args[1]
		}
		else {
			throw new Error('unknown arguments')
		}

		// Check
		if ( this.state === 'active' && opts.reset !== true ) {
			next()
			return this
		}

		// Close our all watch listeners
		this.close()

		// Log
		this.log('debug', `watch init: ${this.path}`)

		// Fetch the stat then try again
		this.getStat({}, (err) => {
			if ( err )  return next(err)

			// Watch ourself
			this.watchSelf({}, (err) => {
				if ( err )  return next(err)

				// Watch the children
				this.watchChildren({}, (err) => {
					if ( err ) {
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
module.exports = {open, create, Stalker, Watcher}
