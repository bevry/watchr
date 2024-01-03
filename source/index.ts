/* eslint no-use-before-define:0 */

// builtin
import { join } from 'path'
import {
	Stats,
	FSWatcher,
	stat as getTargetStat,
	lstat as getLinkStat,
	exists as getExists,
	readdir,
	watch, // added in Node.js v0.5.10 (wow watchr goes back a while!)
	watchFile, // added in Node.js v0.1.31 (wow watchr goes back a while!)
	unwatchFile,
} from 'fs'
import { EventEmitter } from 'events'

// external
import scandir from 'scandirectory'
import isIgnoredPath, { Options as IgnoreOptions } from 'ignorefs'
import { TaskGroup } from 'taskgroup'

export enum State {
	Pending = 'pending',
	Active = 'active',
	Deleted = 'deleted',
	Closed = 'closed',
}

/** The technique to use to observe the file system */
export enum Method {
	Watch = 'watch',
	WatchFile = 'watchFile',
}

/** Change events that we emit */
export enum EventChange {
	Update = 'update',
	Delete = 'delete',
	Create = 'create',
}

/** All types of events that we emit */
export enum Event {
	Change = 'change',
	Log = 'log',
	Close = 'close',
}

export type ErrorCallback = (error?: any) => void
export type StatCallback = (error?: any, stat?: Stats) => void

/** A change event of {@link EventChange.Update} has occurred on the path */
export type EventChangeUpdateCallback = (
	changeEvent: EventChange.Update,
	absolutePath: string,
	currentStat: Stats,
	previousStat: Stats
) => void

/** A change event of {@link EventChange.Delete} has occurred on the path */
export type EventChangeDeleteCallback = (
	changeEvent: EventChange.Delete,
	absolutePath: string,
	currentStat: null,
	priorStat: Stats
) => void

/** A change event of {@link EventChange.Create} has occurred on the path */
export type EventChangeCreateCallback = (
	changeEvent: EventChange.Create,
	absolutePath: string,
	currentStat: Stats,
	priorSTat: null
) => void

/** Change event listener for {@link Watcher} */
export type EventChangeCallback =
	| EventChangeUpdateCallback
	| EventChangeDeleteCallback
	| EventChangeCreateCallback

/** A log event of {@link EventChange.Log} has occurred */
export type EventLogCallback = (
	event: Event.Log,
	logLevel: string,
	...args: Array<any>
) => void

/** A close event of {@link EventChange.Close} has occurred, perhaps for a reason. */
export type EventCloseCallback = (event: Event.Close, reason: string) => void

/** Completion callback for {@link Watcher.watch}  */
export type CompletionCallback = (error?: any) => void

export interface WatchChildOptions {
	absolutePath: string
	relativePath: string
	stat?: Stats
}

export interface WatchSelfOptions {
	/** the current errors that we have received attempting the preferred methods */
	errors?: Array<Error>
	/** fallback to the configuration if not specified */
	preferredMethods?: Array<Method>
}

export interface ListenerOptions {
	method: Method
	args: Array<any>
}

export interface ResetOptions {
	/** should we always close existing watchers and setup new watchers */
	reset?: boolean
}

/** Configuration for {@link Watcher} instances */
export interface WatcherConfig extends IgnoreOptions {
	/** If {@link Method.WatchFile} is used, this is the interval to use for change detection if polling is needed */
	interval: number
	/** If {@link Method.WatchFile} is used, this is whether or not watching should keep the node process alive while active */
	persistent: boolean
	/** This is the delay to wait after a change event to be able to detect swap file changes accurately (without a delay, swap files trigger a delete and creation event, with a delay they trigger a single update event) */
	catchupDelay: number
	/** The order of watch methods to attempt, if the first fails, move onto the second */
	preferredMethods: Array<Method>
	/** The method that was actually used */
	method?: Method
	/** The arguments from the watching method */
	args?: Array<any>
	/** If true, will use {@link stat} instead of {@link lstat} */
	followLinks: boolean
}

/** Possible configuration for {@link Watcher} instances */
export interface WatcherOptions extends Partial<WatcherConfig> {
	/** A stat object for the path if we already have one, otherwise it will be fetched for us */
	stat?: Stats
}

/** Helper for error logging */
function errorToString(error: any): string {
	return error.stack?.toString() || error.message || error.toString()
}

/** Alias for creating a new {@link Stalker} with some basic configuration */
export function open(
	path: string,
	changeListener: EventChangeCallback,
	next: CompletionCallback
): Stalker {
	const stalker = new Stalker(path)
	stalker.on('change', changeListener)
	stalker.watch({}, next)
	return stalker
}

/** Alias for creating a new {@link Stalker} */
export function create(path: string): Stalker {
	return new Stalker(path)
}

/**
 * Stalker
 * A watcher of the watchers.
 * Events that are listened to on the stalker will also be listened to on the attached watcher.
 * When the watcher is closed, the stalker's listeners will be removed.
 * When all stalkers for a watcher are removed, the watcher will close.
 */
export class Stalker extends EventEmitter {
	/** Singleton collection of all {@link Watcher} instances mapped by path */
	static watchers: { [path: string]: Watcher } = {}

	/** the associated {@link Watcher} for this stalker */
	watcher: Watcher

	/** Create a new stalker for the given path */
	constructor(path: string) {
		super()

		// Add our watcher to the singleton
		if (Stalker.watchers[path] == null)
			Stalker.watchers[path] = new Watcher(path)
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
		this.on('newListener', (eventName, listener) =>
			this.watcher.on(eventName, listener)
		)
		this.on('removeListener', (eventName, listener) =>
			this.watcher.removeListener(eventName, listener)
		)
	}

	/** Cleanly shutdown the stalker */
	private remove() {
		// Remove our stalker from the watcher
		const index = this.watcher.stalkers.indexOf(this)
		if (index !== -1) {
			this.watcher.stalkers = this.watcher.stalkers
				.slice(0, index)
				.concat(this.watcher.stalkers.slice(index + 1))
		}

		// Kill our stalker
		process.nextTick(() => {
			this.removeAllListeners()
		})

		// Chain
		return this
	}

	/**
	 * Close the stalker, and if it is the last stalker for the path, close the watcher too
	 * @param reason optional reason to provide for closure
	 */
	public close(reason?: string) {
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

	/** Alias for {@link Watcher.setConfig} */
	public setConfig(opts: WatcherOptions) {
		this.watcher.setConfig(opts)
		return this
	}

	/** Alias for {@link Watcher.watch}  */
	public watch(
		...args: [next: ErrorCallback] | [opts: ResetOptions, next: ErrorCallback]
	) {
		this.watcher.watch(...args)
		return this
	}
}

/**
 * Watcher
 * Watches a path and if its a directory, its children too, and emits change events for updates, deletions, and creations
 */
export class Watcher extends EventEmitter {
	/** The associated {@link Stalker} instances for this watcher */
	stalkers: Array<Stalker> = []

	/** The path to be watched */
	path: string

	/** The stat object for the path */
	stat: null | Stats = null

	/** If {@link Method.Watch} is used, this is the {@link FSWatcher} instance for it */
	fswatcher: null | FSWatcher = null

	/** Map of children */
	children: { [relativePath: string]: Stalker } = {}

	/** the current state of this watcher */
	state: State = State.Pending

	/** the TaskGroup instance for queuing listen events */
	listenerTaskGroup: null | TaskGroup = null

	/** the timeout result for queuing listen events */
	listenerTimeout: null | NodeJS.Timeout = null

	/** The configuration options with sensible defaults applied. */
	config: WatcherConfig = {
		interval: 5007,
		persistent: true,
		catchupDelay: 2000,
		preferredMethods: [Method.Watch, Method.WatchFile],
		followLinks: true,
		ignoreUndesiredBasenames: true,
	}

	/** Create a new watcher for the given path */
	constructor(path: string) {
		// Construct the EventEmitter
		super()
		// Initialise properties
		this.path = path
	}

	/** Configure */
	public setConfig(opts: WatcherOptions) {
		// Stat
		if (opts.stat) {
			this.stat = opts.stat
			delete opts.stat
		}

		// Apply
		Object.assign(this.config, opts)

		// Chain
		return this
	}

	/** Emit a log event with the given arguments */
	public log(...args: Array<any>) {
		// Emit the log event
		this.emit('log', ...args)

		// Chain
		return this
	}

	/**
	 * Check whether or not a path should be ignored or not based on our current configuration options
	 * @param path the path (likely of a child)
	 */
	private isIgnoredPath(path: string): boolean {
		// Ignore?
		const ignore = isIgnoredPath(path, this.config)

		// Return
		return ignore
	}

	/**
	 * Get the stat for the path of the watcher
	 * If the stat already exists and {@link ResetOptions.reset} is not `true`, then just use the current stat, otherwise fetch a new stat and apply it to the watcher
	 */
	private getStat(opts: ResetOptions, next: StatCallback) {
		// Figure out what stat method we want to use
		const method = this.config.followLinks ? getTargetStat : getLinkStat

		// Fetch
		if (this.stat && opts.reset !== true) {
			next(null, this.stat)
		} else {
			method(this.path, (err, stat) => {
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
				- This value can also be unreliable at times
	- both methods:
		- For deleted and changed files, it will fire on the file
		- For new files, it will fire on the directory

	Output arguments for your emitted event will be:
	- for updated files the arguments will be: `'update', absolutePath, currentStat, previousStat`
	- for created files the arguments will be: `'create', absolutePath, currentStat, null`
	- for deleted files the arguments will be: `'delete', absolutePath, null, previousStat`

	In the future we will add:
	- for renamed files: 'rename', absolutePath, currentStat, previousStat, newabsolutePath
	- rename is possible as the stat.ino is the same for the delete and create
	*/
	private listener(opts: WatcherOptions, next?: ErrorCallback) {
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
		let currentStat: Stats | null = null,
			previousStat: Stats | null = null

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
			} else {
				this.emit('error', new Error('unexpected state'))
			}
		}, config.catchupDelay || 0)

		// We are a subsequent listener, in which case, just listen to the first listener tasks
		if (this.listenerTaskGroup != null) {
			this.listenerTaskGroup.done(next)
			return this
		}

		// Start the detection process
		const tasks = new TaskGroup(`listener tasks for ${this.path}`, {
			domain: false,
		})
		this.listenerTaskGroup = tasks
		tasks.done(next)

		tasks.addTask(
			'check if the file still exists',
			(complete: ErrorCallback) => {
				// Log
				this.log(
					'debug',
					`watch evaluating on: ${this.path} [state: ${this.state}]`
				)

				// Check if this is still needed
				if (this.state !== State.Active) {
					this.log('debug', `watch discarded on: ${this.path}`)
					tasks.clearRemaining()
					return complete()
				}

				// Check if the file still exists
				getExists(this.path, (exists) => {
					// Apply local global property
					previousStat = this.stat

					// If the file still exists, then update the stat
					if (exists === false) {
						// Log
						this.log('debug', `watch emit delete: ${this.path}`)

						// Apply
						this.stat = null
						this.close('deleted')
						this.emit(
							'change',
							EventChange.Delete,
							this.path,
							null,
							previousStat
						)

						// Clear the remaining tasks, as they are no longer needed
						tasks.clearRemaining()
						return complete()
					}

					// Update the stat of the fil
					this.getStat({ reset: true }, (err, stat) => {
						// Check
						if (err) return complete(err)

						// Update
						currentStat = stat || null

						// Complete
						return complete()
					})
				})
			}
		)

		tasks.addTask(
			'check if the file has changed',
			(complete: ErrorCallback) => {
				// Ensure stats exist
				if (!currentStat || !previousStat) {
					return complete(new Error('unexpected state'))
				}

				// Check if there is a different file at the same location
				// If so, we will need to rewatch the location and the children
				if (currentStat.ino.toString() !== previousStat.ino.toString()) {
					this.log(
						'debug',
						`watch found replaced: ${this.path}`,
						currentStat,
						previousStat
					)
					// note this will close the entire tree of listeners and reinstate them
					// however, as this is probably for a file, it is probably not that bad
					return this.watch({ reset: true }, complete)
				}

				// Check if the file or directory has been modified
				if (currentStat.mtime.toString() !== previousStat.mtime.toString()) {
					this.log(
						'debug',
						`watch found modification: ${this.path}`,
						previousStat,
						currentStat
					)
					return complete()
				}

				// Otherwise it is the same, and nothing is needed to be done
				else {
					tasks.clearRemaining()
					return complete()
				}
			}
		)

		tasks.addGroup(
			'check what has changed',
			{ concurrency: 0 },
			(addGroup: any, addTask: any, done: ErrorCallback) => {
				// Ensure stats exist
				if (!currentStat || !previousStat) {
					return done(new Error('unexpected state'))
				}

				// So let's check if we are a directory
				if (currentStat.isDirectory() === false) {
					// If we are a file, lets simply emit the change event
					this.log('debug', `watch emit update: ${this.path}`)
					this.emit(
						'change',
						EventChange.Update,
						this.path,
						currentStat,
						previousStat
					)
					return done()
				}

				// We are a direcotry
				// Chances are something actually happened to a child (rename or delete)
				// and if we are the same, then we should scan our children to look for renames and deletes
				readdir(this.path, (err, newFileRelativePaths) => {
					// Error?
					if (err) return done(err)

					// Log
					this.log(
						'debug',
						`watch read dir: ${this.path}`,
						newFileRelativePaths
					)

					// Find deleted files
					for (const childFileRelativePath of Object.keys(this.children)) {
						const child = this.children[childFileRelativePath]

						// Skip if the file still exists
						if (newFileRelativePaths.includes(childFileRelativePath)) continue

						// Fetch full path
						const childFileabsolutePath = join(this.path, childFileRelativePath)

						// Skip if ignored file
						if (this.isIgnoredPath(childFileabsolutePath)) {
							this.log(
								'debug',
								`watch ignored delete: ${childFileabsolutePath} via: ${this.path}`
							)
							continue
						}

						// Emit the event and note the change
						this.log(
							'debug',
							`watch emit delete: ${childFileabsolutePath} via: ${this.path}`
						)
						const childPreviousStat = child.watcher.stat
						child.close('deleted')
						this.emit(
							'change',
							EventChange.Delete,
							childFileabsolutePath,
							null,
							childPreviousStat
						)
					}

					// Find new files, creating a scope
					newFileRelativePaths.forEach((childFileRelativePath) => {
						// Skip if we are already watching this file
						if (this.children[childFileRelativePath] != null) return

						// Fetch full path
						const childFileabsolutePath = join(this.path, childFileRelativePath)

						// Skip if ignored file
						if (this.isIgnoredPath(childFileabsolutePath)) {
							this.log(
								'debug',
								`watch ignored create: ${childFileabsolutePath} via: ${this.path}`
							)
							return
						}

						// Emit the event and note the change
						addTask('watch the new child', (complete: ErrorCallback) => {
							this.log(
								'debug',
								`watch determined create: ${childFileabsolutePath} via: ${this.path}`
							)
							if (this.children[childFileRelativePath] != null) {
								return complete() // this should never occur
							}
							const child = this.watchChild(
								{
									absolutePath: childFileabsolutePath,
									relativePath: childFileRelativePath,
								},
								(err) => {
									if (err) return complete(err)
									this.emit(
										'change',
										EventChange.Create,
										childFileabsolutePath,
										child.watcher.stat,
										null
									)
									return complete()
								}
							)
						})
					})

					// Read the directory, finished adding tasks to the group
					return done()
				})
			}
		)

		// Tasks are executed via the timeout thing earlier

		// Chain
		return this
	}

	/**
	 * Close the watching abilities of this watcher and its children if it has any
	 * And mark the state as deleted or closed, depending on the reason
	 */
	close(reason: string = 'unknown') {
		// Nothing to do? Already closed?
		if (this.state !== State.Active) return this

		// Close
		this.log('debug', `close: ${this.path}`)

		// Close our children
		for (const child of Object.values(this.children)) {
			child.close(reason)
		}

		// Close watch listener
		if (this.fswatcher != null) {
			this.fswatcher.close()
			this.fswatcher = null
		} else {
			unwatchFile(this.path)
		}

		// Updated state
		if (reason === 'deleted') {
			this.state = State.Deleted
		} else {
			this.state = State.Closed
		}

		// Emit our close event
		this.log('debug', `watch closed because ${reason} on ${this.path}`)
		this.emit('close', reason)

		// Chain
		return this
	}

	/**
	 * Create the child watcher/stalker for a given sub path of this watcher with inherited configuration
	 * Once created, attach it to `this.children` and bubble `log` and `change` events
	 * If the child closes, then delete it from `this.children`
	 */
	private watchChild(opts: WatchChildOptions, next: ErrorCallback): Stalker {
		// Prepare
		const watchr = this

		// Create the child
		const child = create(opts.absolutePath)

		// Apply the child
		this.children[opts.relativePath] = child

		// Add the extra listeners
		child.once('close', () => delete watchr.children[opts.relativePath])
		child.on('log', (...args) => watchr.emit('log', ...args))
		child.on('change', (...args) => watchr.emit('change', ...args))

		// Add the extra configuration
		child.setConfig(opts)

		// Start the watching
		child.watch(next)

		// Return the child
		return child
	}

	/**
	 * Read the directory at our given path and watch each child
	 * @param opts  not currently used
	 */
	private watchChildren(opts: {}, next: ErrorCallback) {
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
				...this.config,
				directory: path,
				recurse: false,
			})
				.then((results) => {
					const tasks = new TaskGroup(`scandir tasks for ${path}`, {
						domain: false,
						concurrency: 0,
					})
					tasks.done(next)
					Object.keys(results).forEach(function (relativePath) {
						tasks.addTask(function (complete: ErrorCallback) {
							const absolutePath = join(path, relativePath)
							// Check we are still relevant
							if (watchr.state !== State.Active) return complete()
							// Watch this child
							watchr.watchChild({ absolutePath, relativePath }, complete)
						})
					})
					tasks.run()
				})
				.catch((err) => next(err))
		} else {
			next()
		}

		// Chain
		return this
	}

	/** Setup the watching using the specified method. */
	private watchMethod(method: Method, next: ErrorCallback): void {
		if (method === Method.Watch) {
			// Watch
			try {
				this.fswatcher = watch(this.path, (...args) =>
					this.listener({ method, args })
				)
				// must pass the listener here instead of doing fswatcher.on('change', opts.listener)
				// as the latter is not supported on node 0.6 (only 0.8+)
			} catch (err) {
				next(err)
				return
			}

			// Success
			next()
			return
		} else if (method === Method.WatchFile) {
			// Watch
			try {
				watchFile(
					this.path,
					{
						persistent: this.config.persistent,
						interval: this.config.interval,
					},
					(...args) => this.listener({ method, args })
				)
			} catch (err) {
				next(err)
				return
			}

			// Success
			next()
			return
		} else {
			const err = new Error('unknown watch method')
			next(err)
			return
		}
	}

	/** Setup watching for our path, in the order of the preferred methods */
	private watchSelf(opts: WatchSelfOptions, next: ErrorCallback) {
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
				this.state = State.Active

				// Forward
				next()
			})
		} else {
			const errors = opts.errors
				.map((error) => error.stack || error.message || error)
				.join('\n')
			const err = new Error(
				`no watch methods left to try, failures are:\n${errors}`
			)
			next(err)
		}

		// Chain
		return this
	}

	/**
	 * Setup watching for our path, and our children
	 * If we are already watching and `opts.reset` is not `true` then all done
	 * Otherwise, close the current watchers for us and the children via {@link Watcher.close} and setup new ones
	 */
	watch(
		...args: [next: ErrorCallback] | [opts: ResetOptions, next: ErrorCallback]
	) {
		// Handle overloaded signature
		let opts: ResetOptions, next: ErrorCallback
		if (args.length === 1) {
			opts = {}
			next = args[0]
		} else if (args.length === 2) {
			opts = args[0]
			next = args[1]
		} else {
			throw new Error('unknown arguments')
		}

		// Check
		if (this.state === State.Active && opts.reset !== true) {
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
						this.log(
							'debug',
							`watch failed on [${this.path}] with ${errorToString(err)}`
						)
					} else {
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
