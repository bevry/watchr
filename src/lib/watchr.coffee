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
	config: null

	# Now it's time to construct our watcher
	# We give it a path, and give it some events to use
	# Then we get to work with watching it
	constructor: (config,next) ->
		# Initialize our object variables for our instance
		@children = {}
		@config = {}

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
	log: (args...) ->
		@emit('log',args...)
		@

	###
	Setup our Instance
	config =
	- `path` a single path to watch
	- `listener` (optional, detaults to null) single change listener, forwared to @listen
	- `listeners` (optional, defaults to null) multiple event listeners, forwarded to @listen
	- `stat` (optional, defaults to `null`) a file stat object to use for the path, instead of fetching a new one
	- `ignoreHiddenFiles` (optional, defaults to `false`) whether or not to ignored files which filename starts with a `.`
	- `ignoreCommonPatterns` (optional, defaults to `true`) whether or not to ignore common undesirable file patterns (e.g. `.svn`, `.git`, `.DS_Store`, `thumbs.db`, etc)
	- `ignoreCustomPatterns` (optional, defaults to `null`) any custom ignore patterns that you would also like to ignore along with the common patterns
	- `interval` (optional, defaults to `100`) for systems that poll to detect file changes, how often should it poll in millseconds
	- `persistent` (optional, defaults to `true`) whether or not we should keep the node process alive for as long as files are still being watched
	###
	setup: (config) ->
		# Path
		@path = config.path

		# Options
		@config = config
		@config.ignoreHiddenFiles ?= false
		@config.ignoreCommonPatterns ?= true
		@config.ignoreCustomPatterns ?= null
		@config.interval ?= 100
		@config.persistent ?= true

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
		@log('debug',"bubble on #{@path} with the args:",args)

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
	Listener
	A change event has fired

	Things to note:
	- watchFile:
		- currentStat still exists even for deleted/renamed files
		- for deleted and updated files, it will fire on the file
		- for created files, it will fire on the directory
	- fsWatcher:
		- eventName is always 'change'
		- 'rename' is not yet implemented by node
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
	listener: (args...) ->
		# Prepare
		me = @
		fileFullPath = @path
		currentStat = null
		previousStat = @stat
		fileExists = null

		# Log
		@log('debug',"watch event triggered on #{@path}\n", args)

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
								return @emit('error',err)  if err
								# Check for new files
								balUtil.each newFileRelativePaths, (newFileRelativePath) =>
									if @children[newFileRelativePath]?
										# already exists
									else
										# new file
										newFileFullPath = pathUtil.join(fileFullPath,newFileRelativePath)
										balUtil.stat newFileFullPath, (err,newFileStat) =>
											return @emit('error',err)  if err
											@log('debug','determined create:',newFileFullPath)
											@emit('change','create',newFileFullPath,newFileStat,null)
											@watchChild(newFileFullPath,newFileRelativePath,newFileStat)
								# Check for deleted files
								balUtil.each @children, (childFileWatcher,childFileRelativePath) =>
									if childFileRelativePath in newFileRelativePaths
										# still exists
									else
										# deleted file
										childFileFullPath = pathUtil.join(fileFullPath,childFileRelativePath)
										@log('debug','determined delete:',childFileFullPath)
										@closeChild(childFileRelativePath,'deleted')


					# If we are a file, lets simply emit the change event
					else
						# It has changed, so let's emit a change event
						@log('debug','determined update:',fileFullPath)
						@emit('change','update',fileFullPath,currentStat,previousStat)

		# Check if the file still exists
		balUtil.exists fileFullPath, (exists) ->
			# Apply
			fileExists = exists

			# If the file still exists, then update the stat
			if fileExists
				balUtil.stat fileFullPath, (err,stat) ->
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

		# Close listener
		if @method is 'watchFile'
			fsUtil.unwatchFile(@path)
		else if @method is 'watch'  and  @fswatcher
			@fswatcher.close()
			@fswatcher = null

		# Updated state
		if reason is 'deleted'
			@state = 'deleted'
			@emit('change','delete',@path,null,@stat)
		else
			@state = 'closed'

		# Delete our watchers reference
		delete watchers[@path]  if watchers[@path]?

		# Chain
		@

	# Close a child
	closeChild: (fileRelativePath,reason) ->
		# Prepare
		watcher = @children[fileRelativePath]

		# Check
		if watcher
			delete @children[fileRelativePath]
			watcher.close(reason)

		# Chain
		@

	###
	Watch Child
	Setup watching for a child
	Bubble events of the child into our instance
	Also instantiate the child with our instance's configuration where applicable
	###
	watchChild: (fileFullPath,fileRelativePath,fileStat,next) ->
		# Prepare
		me = @
		config = @config

		# Watch the file
		watcher = watch(
			path: fileFullPath
			stat: fileStat
			ignoreHiddenFiles: config.ignoreHiddenFiles
			ignoreCommonPatterns: config.ignoreCommonPatterns
			ignoreCustomPatterns: config.ignoreCustomPatterns
			listeners:
				'change': (args...) =>
					[changeType,path] = args
					if changeType is 'delete' and path is fileFullPath
						@closeChild(fileRelativePath,'deleted')
					me.bubble('change', args...)
				'error': me.bubbler('error')
			next: (args...) ->
				# Prepare
				[err] = args

				# Stop if an error happened
				return next?(err)  if err

				# Store the child watcher in us
				me.children[fileRelativePath] = watcher

				# Proceed to the next file
				next?(args...)
		)

		# Return
		return watcher

	###
	Watch
	Setup the native watching handlers for our path so we can receive updates on when things happen
	If the next argument has been received, then add it is a once listener for the watching event
	If we are already watching this path then let's start again (call close)
	If we are a directory, let's recurse
	If we are deleted, then don't error but return the isWatching argument of our completion callback as false
	Once watching has completed for this directory and all children, then emit the watching event
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

		# Prepare Start Watching
		startWatching = =>
			# Create a set of tasks
			tasks = new balUtil.Group (err) =>
				return @emit('watching',err,@,false)  if err
				return @emit('watching',err,@,true)
			tasks.total = 2

			# Cycle through the directory if necessary
			if @isDirectory
				balUtil.scandir(
					# Path
					path: @path

					# Options
					ignoreHiddenFiles: config.ignoreHiddenFiles
					ignoreCommonPatterns: config.ignoreCommonPatterns
					ignoreCustomPatterns: config.ignoreCustomPatterns
					recurse: false

					# Next
					next: (err) ->
						tasks.complete(err)

					# File and Directory Actions
					action: (fileFullPath,fileRelativePath,nextFile,fileStat) ->
						# Watch it
						me.watchChild fileFullPath, fileRelativePath, fileStat, (err) ->
							nextFile(err)
				)
			else
				tasks.complete()

			# Watch the current file/directory
			try
				# Try first with fsUtil.watchFile
				watchFileOpts =
					persistent: config.persistent
					interval: config.interval
				fsUtil.watchFile @path, watchFileOpts, (args...) ->
					me.listener.apply(me,args)
				@method = 'watchFile'
			catch err
				# Then try with fsUtil.watch
				@fswatcher = fsUtil.watch @path, (args...) ->
					me.listener.apply(me,args)
				@method = 'watch'

			# We are now watching so set the state as active
			@state = 'active'
			tasks.complete()

		# Check if we still exist
		balUtil.exists @path, (exists) =>
			# Check
			unless exists
				# We don't exist anymore, move along
				return @emit('watching',null,@,false)

			# Start watching
			startWatching()

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
		watcher = new Watcher opts, (err) ->
			next?(err,watcher)
		watchers[path] = watcher

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
