# Require the node.js path module
# This provides us with what we need to interact with file paths
pathUtil = require('path')

# Require the node.js fs module
# This provides us with what we need to interact with the file system
fsUtil = require('fs')

# Require the balUtil module
# This provides us with various flow logic and path utilities
balUtil = require('bal-util')

# Require the node.js event emitter
# This provides us with the event system that we use for binding and trigger events
EventEmitter = require('events').EventEmitter

###
Now to make watching files more convient and managed, we'll create a class which we can use to attach to each file.
It'll provide us with the API and abstraction we need to accomplish difficult things like recursion.
We'll also store a global store of all the watchers and their paths so we don't have multiple watchers going at the same time
for the same file - as that would be quite ineffecient.
Events:
- `log` for debugging, receives the arguments `logLevel ,args...`
- `error` for gracefully listening to error events, receives the arguments `err`
- `watching` for when watching of the path has completed, receives the arguments `err, watcherInstance, isWatching`
- `change` for listening to change events, receives the arguments `changeType, fullPath, currentStat, previousStat`
###
watchersTotal = 0
watchers = {}
Watcher = class extends EventEmitter
	# The path this class instance is attached to
	path: null

	# Is it a directory or not?
	isDirectory: null

	# Our stat object, it contains things like change times, size, and is it a directory
	stat: null

	# The node.js file watcher instance, we have to open and close this, it is what notifies us of the events
	fswatcher: null

	# The watchers for the children of this watcher will go here
	# This is for when we are watching a directory, we will scan the directory and children go here
	children: null  # {}

	# We have to store the current state of the watcher and it is asynchronous (things can fire in any order)
	# as such, we don't want to be doing particular things if this watcher is deactivated
	# valid states are: pending, active, closed, deleted
	state: 'pending'

	# The method we will use to watch the files
	# Preferably we use watchFile, however we may need to use watch in case watchFile doesn't exist (e.g. windows)
	method: null

	# Configuration
	config:
		# A single path to watch
		path: null

		# Listener (optional, detaults to null)
		# single change listener, forwaded to @listen
		listener: null

		# Listeners (optional, defaults to null)
		# multiple event listeners, forwarded to @listen
		listeners: null

		# Stat (optional, defaults to `null`)
		# a file stat object to use for the path, instead of fetching a new one
		stat: null

		# Should we output log messages?
		outputLog: false

		# Interval (optional, defaults to `5007`)
		# for systems that poll to detect file changes, how often should it poll in millseconds
		# if you are watching a lot of files, make this value larger otherwise you will have huge memory load
		# only appliable to the `watchFile` watching method
		interval: 5007

		# Persistent (optional, defaults to `true`)
		# whether or not we should keep the node process alive for as long as files are still being watched
		# only appliable to the `watchFile` watching method
		persistent: true

		# Duplicate Delay (optional, defaults to `1000`)
		# sometimes events will fire really fast, this delay is set in place to ensure we don't fire the same event
		# within the duplicateDelay timespan
		duplicateDelay: 1*1000

		# Preferred Methods (optional, defaults to `['watch','watchFile']`)
		# In which order should use the watch methods when watching the file
		preferredMethods: null

		# Ignore Paths (optional, defaults to `false`)
		# array of paths that we should ignore
		ignorePaths: false

		# Ignore Hidden Files (optional, defaults to `false`)
		# whether or not to ignored files which filename starts with a `.`
		ignoreHiddenFiles: false

		# Ignore Common Patterns (optional, defaults to `true`)
		# whether or not to ignore common undesirable file patterns (e.g. `.svn`, `.git`, `.DS_Store`, `thumbs.db`, etc)
		ignoreCommonPatterns: true

		# Ignore Custom PAtterns (optional, defaults to `null`)
		# any custom ignore patterns that you would also like to ignore along with the common patterns
		ignoreCustomPatterns: null


	# Now it's time to construct our watcher
	# We give it a path, and give it some events to use
	# Then we get to work with watching it
	constructor: (config,next) ->
		# Initialize our object variables for our instance
		@children = {}
		@config = balUtil.extend({},@config)
		@config.preferredMethods = ['watch','watchFile']

		# If next exists within the configuration, then use that as our next handler, if our next handler isn't already defined
		# Eitherway delete the next handler from the config if it exists
		if config.next?
			next ?= config.next
			delete config.next

		# Setup our instance with the configuration
		@setup(config)  if config

		# Start the watch setup
		@watch(next)    if next

		# Chain
		@

	# Log
	log: (args...) =>
		console.log(args...)  if @config.outputLog
		@emit('log',args...)
		@

	# Is Ignored Path
	isIgnoredPath: (path,opts={}) =>
		# Ignore?
		ignore = balUtil.isIgnoredPath(path,{
			ignorePaths: opts.ignorePaths ? @config.ignorePaths
			ignoreHiddenFiles: opts.ignoreHiddenFiles ? @config.ignoreHiddenFiles
			ignoreCommonPatterns: opts.ignoreCommonPatterns ? @config.ignoreCommonPatterns
			ignoreCustomPatterns: opts.ignoreCustomPatterns ? @config.ignoreCustomPatterns
		})

		# Log
		@log('debug',"ignore: #{path} #{if ignore then 'yes' else 'no'}")

		# Return
		return ignore

	###
	Setup our Instance
	###
	setup: (config) ->
		# Apply
		balUtil.extend(@config,config)

		# Path
		@path = @config.path

		# Stat
		if @config.stat
			@stat = @config.stat
			@isDirectory = @stat.isDirectory()
			delete @config.stat

		# Listeners
		if @config.listener or @config.listeners
			@removeAllListeners()
			if @config.listener
				@listen(@config.listener)
				delete @config.listener
			if @config.listeners
				@listen(@config.listeners)
				delete @config.listeners

		# Chain
		@

	# Before we start watching, we'll have to setup the functions our watcher will need

	# Bubble
	# We need something to bubble events up from a child file all the way up the top
	bubble: (args...) =>
		# Log
		#@log('debug',"bubble on #{@path} with the args:",args)

		# Trigger
		@emit(args...)

		# Chain
		@

	# Bubbler
	# Setup a bubble wrapper
	bubbler: (eventName) =>
		return (args...) => @bubble(args...)

	###
	Listen
	Add listeners to our watcher instance.
	Overloaded to also accept the following:
	- `changeListener` a single change listener
	- `[changeListener]` an array of change listeners
	- `{eventName:eventListener}` an object keyed with the event names and valued with a single event listener
	- `{eventName:[eventListener]}` an object keyed with the event names and valued with an array of event listeners
	###
	listen: (eventName,listener) ->
		# Check format
		unless listener?
			# Alias
			listeners = eventName

			# Array of change listeners
			if balUtil.isArray(listeners)
				for listener in listeners
					@listen('change',listener)

			# Object of event listeners
			else if balUtil.isPlainObject(listeners)
				for own eventName,listenerArray of listeners
					# Array of event listeners
					if balUtil.isArray(listenerArray)
						for listener in listenerArray
							@listen(eventName,listener)
					# Single event listener
					else
						@listen(eventName,listenerArray)

			# Single change listener
			else
				@listen('change',listeners)
		else
			# Listen
			@removeListener(eventName,listener)
			@on(eventName,listener)
			@log('debug',"added a listener: on #{@path} for event #{eventName}")

		# Chain
		@

	###
	Emit Safe
	Sometimes events can fire incredibly quickly in which case we'll determine multiple events
	This alias for emit('change',...) will check to see if the event has already been fired recently
	and if it has, then ignore it
	###
	cacheTimeout: null
	cachedEvents: null
	emitSafe: (args...) ->
		# Prepare
		me = @
		config = @config

		# Clear duplicate timeout
		clearTimeout(@cacheTimeout)  if @cacheTimeout?
		@cacheTimeout = setTimeout(
			->
				me.cachedEvents = []
				me.cacheTimeout = null
			config.duplicateDelay
		)
		@cachedEvents ?= []

		# Check duplicate
		thisEvent = args.toString()
		if thisEvent in @cachedEvents
			@log('debug',"event ignored on #{@path} due to duplicate:", args)
			return @
		@cachedEvents.push(thisEvent)

		# Fire the event
		@emit(args...)

		# Chain
		@

	###
	Listener
	A change event has fired

	Things to note:
	- watchFile:
		- currentStat still exists even for deleted/renamed files
		- for deleted and updated files, it will fire on the file
		- for created files, it will fire on the directory
	- fsWatcher:
		- eventName is either 'change' or 'rename', this value cannot be trusted
		- currentStat still exists even for deleted/renamed files
		- previousStat is accurate, however we already have this
		- for deleted and changed files, it will fire on the file
		- for new files, it will fire on the directory

	Arguments for our change listener will be:
	- for updated files the arguments will be: `'update', fullPath, currentStat, previousStat`
	- for created files the arguments will be: `'create', fullPath, currentStat, null`
	- for deleted files the arguments will be: `'delete', fullPath, null, previousStat`

	In the future we will add:
	- for renamed files: 'rename', fullPath, currentStat, previousStat, newFullPath
	- rename is possible as the stat.ino is the same for the delete and create
	###
	listener: (args...) =>
		# Prepare
		me = @
		fileFullPath = @path
		currentStat = null
		previousStat = @stat
		fileExists = null

		# Log
		@log('debug',"watch event triggered on #{@path}:", args)

		# Prepare: is the same?
		isTheSame = =>
			if currentStat? and previousStat?
				if currentStat.size is previousStat.size and currentStat.mtime.toString() is previousStat.mtime.toString()
					return true
			return false

		# Prepare: determine the change
		determineTheChange = =>
			# If we no longer exist, then we where deleted
			if !fileExists
				@log('debug','determined delete:',fileFullPath)
				@close('deleted')

			# Otherwise, we still do exist
			else
				# Let's check for changes
				if isTheSame()
					# nothing has changed, so ignore
					@log('debug',"determined same:",fileFullPath)

				# Otherwise, something has changed
				else
					# So let's check if we are a directory
					# as if we are a directory the chances are something actually happened to a child (rename or delete)
					# and if we are the same, then we should scan our children to look for renames and deletes
					if @isDirectory
						if isTheSame() is false
							# Scan children
							balUtil.readdir fileFullPath, (err,newFileRelativePaths) =>
								# Error?
								return @emit('error',err)  if err

								# Check for deleted files
								# by cycling through our known children
								balUtil.each @children, (childFileWatcher,childFileRelativePath) =>
									# Skip if this is a new file (not a deleted file)
									return  if childFileRelativePath in newFileRelativePaths

									# Fetch full path
									childFileFullPath = pathUtil.join(fileFullPath,childFileRelativePath)

									# Skip if ignored file
									return  if @isIgnoredPath(childFileFullPath)

									# Emit the event
									@log('debug','determined delete:',childFileFullPath,'via:',fileFullPath)
									@closeChild(childFileRelativePath,'deleted')

								# Check for new files
								balUtil.each newFileRelativePaths, (childFileRelativePath) =>
									# Skip if we are already watching this file
									return  if @children[childFileRelativePath]?
									@children[childFileRelativePath] = false  # reserve this file

									# Fetch full path
									childFileFullPath = pathUtil.join(fileFullPath,childFileRelativePath)

									# Skip if ignored file
									return  if @isIgnoredPath(childFileFullPath)

									# Fetch the stat for the new file
									balUtil.stat childFileFullPath, (err,childFileStat) =>
										# Error?
										return @emit('error',err)  if err

										# Emit the event
										@log('debug','determined create:',childFileFullPath,'via:',fileFullPath)
										@emitSafe('change','create',childFileFullPath,childFileStat,null)
										@watchChild({
											fullPath: childFileFullPath,
											relativePath: childFileRelativePath,
											stat: childFileStat
										})


					# If we are a file, lets simply emit the change event
					else
						# It has changed, so let's emit a change event
						@log('debug','determined update:',fileFullPath)
						@emitSafe('change','update',fileFullPath,currentStat,previousStat)

		# Check if the file still exists
		balUtil.exists fileFullPath, (exists) =>
			# Apply
			fileExists = exists

			# If the file still exists, then update the stat
			if fileExists
				balUtil.stat fileFullPath, (err,stat) =>
					# Check
					return @emit('error',err)  if err

					# Update
					currentStat = stat
					me.stat = currentStat

					# Get on with it
					determineTheChange()
			else
				# Get on with it
				determineTheChange()

		# Chain
		@

	###
	Close
	We will need something to close our listener for removed or renamed files
	As renamed files are a bit difficult we will want to close and delete all the watchers for all our children too
	Essentially it is a self-destruct
	###
	close: (reason) ->
		return @  if @state isnt 'active'
		@log('debug',"close: #{@path}")

		# Close our children
		for own childRelativePath of @children
			@closeChild(childRelativePath,reason)

		# Close watchFile listener
		if @method is 'watchFile'
			fsUtil.unwatchFile(@path)

		# Close watch listener
		if @fswatcher?
			@fswatcher.close()
			@fswatcher = null

		# Updated state
		if reason is 'deleted'
			@state = 'deleted'
			@emitSafe('change','delete',@path,null,@stat)
		else if reason is 'failure'
			@state = 'closed'
			@log('warn',"Failed to watch the path #{@path}")
		else
			@state = 'closed'

		# Delete our watchers reference
		if watchers[@path]?
			delete watchers[@path]
			watchersTotal--

		# Chain
		@

	# Close a child
	closeChild: (fileRelativePath,reason) ->
		# Check
		if @children[fileRelativePath]?
			watcher = @children[fileRelativePath]
			watcher.close(reason)  if watcher  # could be "fase" for reservation
			delete @children[fileRelativePath]

		# Chain
		@

	###
	Watch Child
	Setup watching for a child
	Bubble events of the child into our instance
	Also instantiate the child with our instance's configuration where applicable
	next(err,watcher)
	###
	watchChild: (opts,next) ->
		# Prepare
		me = @
		config = @config

		# Watch the file if we aren't already
		me.children[opts.relativePath] or= watch(
			# Custom
			path: opts.fullPath
			stat: opts.stat
			listeners:
				'log': me.bubbler('log')
				'change': (args...) ->
					[changeType,path] = args
					if changeType is 'delete' and path is opts.fullPath
						me.closeChild(opts.relativePath,'deleted')
					me.bubble('change', args...)
				'error': me.bubbler('error')
			next: next

			# Inherit
			outputLog: config.outputLog
			interval: config.interval
			persistent: config.persistent
			duplicateDelay: config.duplicateDelay
			preferredMethods: config.preferredMethods
			ignorePaths: config.ignorePaths
			ignoreHiddenFiles: config.ignoreHiddenFiles
			ignoreCommonPatterns: config.ignoreCommonPatterns
			ignoreCustomPatterns: config.ignoreCustomPatterns
		)

		# Return
		return me.children[opts.relativePath]

	###
	Watch Children
	next(err,watching)
	###
	watchChildren: (next) ->
		# Prepare
		me = @
		config = @config

		# Cycle through the directory if necessary
		if @isDirectory
			balUtil.scandir(
				# Path
				path: @path

				# Options
				ignorePaths: config.ignorePaths
				ignoreHiddenFiles: config.ignoreHiddenFiles
				ignoreCommonPatterns: config.ignoreCommonPatterns
				ignoreCustomPatterns: config.ignoreCustomPatterns
				recurse: false

				# Next
				next: (err) ->
					watching = !err
					return next(err,watching)

				# File and Directory Actions
				action: (fullPath,relativePath,nextFile,stat) ->
					# Check we are still releveant
					if me.state isnt 'active'
						return nextFile(null,true)  # skip without error

					# Watch this child
					me.watchChild {fullPath,relativePath,stat}, (err,watcher) ->
						nextFile(err)
			)
		else
			next(null,true)

		# Chain
		return @

	###
	Watch Self
	###
	watchSelf: (next) ->
		# Prepare
		me = @
		config = @config

		# Reset the method
		@method = null

		# Setup our watch methods
		methods =
			# Try with fsUtil.watch
			# next(err,watching)
			watch: (next) ->
				# Check
				return next(null,false)  unless fsUtil.watch?

				# Watch
				try
					me.fswatcher = fsUtil.watch(me.path, me.listener)
					# must pass the listener here instead of via me.fswatcher.on('change', me.listener)
					# as the latter is not supported on node 0.6 (only 0.8+)
				catch err
					return next(err,false)

				# Apply
				me.method = 'watch'
				return next(null,true)

			# Try fsUtil.watchFile
			# next(err,watching)
			watchFile: (next) ->
				# Check
				return next(null,false)  unless fsUtil.watchFile?

				# Options
				watchFileOpts =
					persistent: config.persistent
					interval: config.interval

				# Watch
				try
					fsUtil.watchFile(me.path, watchFileOpts, me.listener)
				catch err
					return next(err,false)

				# Apply
				me.method = 'watchFile'
				return next(null,true)

		# Complete
		complete = (watching) ->
			# Error?
			if !watching
				me.close('failure')
				return next(null,false)

			# Success
			me.state = 'active'
			return next(null,true)

		# Preferences
		methodOne = me.config.preferredMethods[0]
		methodTwo = me.config.preferredMethods[1]

		# Try first
		methods[methodOne] (err1,watching) ->
			# Move on if succeeded
			return complete(watching)  if watching
			# Otherwise...

			# Try second
			methods[methodTwo] (err2,watching) ->
				# Move on if succeeded
				return complete(watching)  if watching
				# Otherwise...

				# Log errors and fail
				me.emit('error',err1)  if err1
				me.emit('error',err2)  if err2
				return complete(false)

		# Chain
		return @

	###
	Watch
	Setup the native watching handlers for our path so we can receive updates on when things happen
	If the next argument has been received, then add it is a once listener for the watching event
	If we are already watching this path then let's start again (call close)
	If we are a directory, let's recurse
	If we are deleted, then don't error but return the isWatching argument of our completion callback as false
	Once watching has completed for this directory and all children, then emit the watching event
	next(err,watcherInstance,success)
	###
	watch: (next) ->
		# Prepare
		me = @
		config = @config

		# Ensure Stat
		if @stat? is false
			# Fetch the stat
			balUtil.stat config.path, (err,stat) =>
				# Error
				return @emit('error',err)  if err

				# Apply
				@stat = stat
				@isDirectory = stat.isDirectory()

				# Recurse
				return @watch(next)

			# Chain
			return @

		# Handle next callback
		@listen('watching',next)  if next?

		# Close our all watch listeners
		@close()

		# Log
		@log('debug',"watch: #{@path}")

		# Prepare
		complete = (err,result) ->
			# Prepare
			err ?= null
			result ?= true

			# Handle
			if err or !result
				me.close()
				me.emit('watching',err,me,false)
			else
				me.emit('watching',null,me,true)

		# Check if we still exist
		balUtil.exists @path, (exists) ->
			# Check
			return complete(null,false)  unless exists

			# Start watching
			me.watchSelf (err,watching) ->
				return complete(err,watching)  if err or !watching
				me.watchChildren (err,watching) ->
					return complete(err,watching)

		# Chain
		@


###
Create Watcher
Checks to see if the path actually exists, if it doesn't then exit gracefully
If it does exist, then lets check our cache for an already existing watcher instance
If we have an already existing watching instance, then just add our listeners to that
If we don't, then create a watching instance
Fire the next callback once done
next(err,watcherInstance)
###
createWatcher = (opts,next) ->
	# Prepare
	{path,listener,listeners} = opts

	# If next exists within the configuration, then use that as our next handler, if our next handler isn't already defined
	# Eitherway delete the next handler from the config if it exists
	if opts.next?
		next ?= opts.next
		delete opts.next

	# Only create a watchr if the path exists
	unless balUtil.existsSync(path)
		next?(null,null)
		return

	# Check if we are already watching that path
	if watchers[path]?
		# We do, so let's use that one instead
		watcher = watchers[path]
		# and add the new listeners if we have any
		watcher.listen(listener)   if listener
		watcher.listen(listeners)  if listeners
		# as we don't create a new watcher, we must fire the next callback ourselves
		next?(null,watcher)
	else
		# We don't, so let's create a new one
		attempt = 0
		watcher = new Watcher opts, (err) ->
			# Continue if we passed
			return next?(err,watcher)  if !err or attempt isnt 0
			++attempt

			# Log
			watcher.log('debug', "Preferred method failed, trying methods in reverse order", err)

			# Otherwise try again with the other preferred method
			watcher
				.setup(
					preferredMethods: watcher.config.preferredMethods.reverse()
				)
				.watch()

		# Save the watcher
		watchers[path] = watcher
		++watchersTotal

	# Return
	return watcher


###
Watch
Provides an abstracted API that supports multiple paths
If you are passing in multiple paths then do not rely on the return result containing all of the watchers
you must rely on the result inside the completion callback instead
If you used the paths option, then your results will be an array of watcher instances, otherwise they will be a single watcher instance
next(err,results)
###
watch = (opts,next) ->
	# Prepare
	result = []

	# If next exists within the configuration, then use that as our next handler, if our next handler isn't already defined
	# Eitherway delete the next handler from the config if it exists
	if opts.next?
		next ?= opts.next
		delete opts.next

	# Check paths as that is handled by us
	if opts.paths
		# Extract it and delte it from the opts
		paths = opts.paths
		delete opts.paths

		# Check its format
		if balUtil.isArray(paths)
			# Prepare
			tasks = new balUtil.Group (err) ->
				next?(err,result)
			for path in paths
				tasks.push {path}, (complete) ->
					localOpts = balUtil.extend({},opts)
					localOpts.path = @path
					watcher = createWatcher(localOpts,complete)
					result.push(watcher)  if watcher
			tasks.async()

		# Paths is actually a single path
		else
			opts.path = paths
			result.push createWatcher opts, (err) ->
				next?(err,result)

	# Single path
	else
		result = createWatcher(opts,next)

	# Return
	return result


# Now let's provide node.js with our public API
# In other words, what the application that calls us has access to
module.exports = {watch,Watcher}
