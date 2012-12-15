###
Watchr is used to be nofitied when a change happens to, or within a directory.
You will not be notified what file was changed, or how it was changed.
It will track new files and their changes too, and remove listeners for deleted files appropriatly.

The source code here is written as an experiment of literate programming
Which means you would be able to understand it, without knowing code
###

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

# Let's set the debugging mode
# We will use this later on when outputting messages that make our code easier to debug
# Note: when we publish the module, we want to set this as off, as we don't want the application using us
#  to spurt our all our debug messages!
debug = false

# Now to make watching files more convient and managed, we'll create a class which we can use to attach to each file
# It'll provide us with the API and abstraction we need to accomplish difficult things like recursion
# We'll also store a global store of all the watchers and their paths so we don't have multiple watchers going at the same time
#  for the same file - as that would be quite ineffecient
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
	# valid states are: pending, active, closed, unlink
	state: 'pending'

	# The method we will use to watch the files
	# Preferably we use watchFile, however we may need to use watch in case watchFile doesn't exist (e.g. windows)
	method: null

	# Configuration
	config: null

	# Now it's time to construct our watcher
	# We give it a path, and give it some events to use
	# Then we get to work with watching it
	# next()
	constructor: (config,next) ->
		# Prepare
		[config,next] = balUtil.extractOptsAndCallback(config,next)
		watcher = @
		@children = {}
		applyStat = (stat) =>
			@stat = stat
			@isDirectory = stat.isDirectory()
			@watch (err) ->
				next?(err,watcher)

		# Path
		@path = config.path

		# Options
		@config = config
		@config.ignoreHiddenFiles ?= false
		@config.ignoreCommonPatterns ?= true
		@config.ignoreCustomPatterns ?= null
		@config.interval ?= 100
		@config.persistent ?= true

		# Event
		if config.listener
			@listen(config.listener)

		# Events
		if config.listeners
			for listener in config.listeners
				@listen(listener)

		# Stat
		if config.stat
			# We already have a stat
			applyStat(config.stat)
		else
			# Fetch a stat
			balUtil.stat config.path, (err,stat) ->
				# Check if we are no longer necessary
				return  if watcher.state isnt 'pending'

				# Check if an error occured
				throw err  if err

				# Apply the stat
				applyStat(stat)


	# Before we start watching, we'll have to setup the functions our watcher will need

	# Listen to the change event for us
	listen: (listener) ->
		# Listen
		@removeListener('changed',listener)
		@on('changed',listener)
		console.log("added a listener: on #{@path}")  if debug

		# Chain
		@

	# We need something to bubble events up from a child file all the way up the top
	bubble: (args...) ->
		# Prepare
		[eventName,filename,currentStat,previousStat] = args

		# Log
		console.log("bubble: #{eventName}: #{filename} on #{@path}")  if debug

		# Trigger
		@emit('changed',eventName,filename,currentStat,previousStat)

		# Chain
		@

	# A change event has fired
	# Things to note:
	#	watchFile:
	#		currentStat still exists even for deleted/renamed files
	#		for deleted and changed files, it will fire on the file
	#		for new files, it will fire on the directory
	#	fsWatcher:
	#		eventName is always 'change', 'rename' is not yet implemented by node
	#		currentStat still exists even for deleted/renamed files
	#		previousStat is accurate, however we already have htis
	#		for deleted and changed files, it will fire on the file
	#		for new files, it will fire on the directory
	# How this should work:
	#	for changed files: 'change', fullPath, currentStat, previousStat
	#	for new files:     'new',    fullPath, currentStat, null
	#	for deleted files: 'unlink', fullPath, null,        previousStat
	# In the future we will add:
	#	for renamed files: 'rename', fullPath, currentStat, previousStat, newFullPath
	#	rename is possible as the stat.ino is the same for the unlink and new
	changed: (args...) ->
		# Prepare
		me = @
		fileFullPath = @path
		currentStat = null
		previousStat = @stat
		fileExists = null

		# Log
		console.log("watch event triggered on #{@path}\n",args)  if debug

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
				console.log('determined unlink:',fileFullPath)  if debug
				@close('unlink')

			# Otherwise, we still do exist
			else
				# Let's check for changes
				if isTheSame()
					# nothing has changed, so ignore
					console.log("determined same:",fileFullPath)  if debug

				# Otherwise, something has changed
				else
					# So let's check if we are a directory
					# as if we are a directory the chances are something actually happened to a child (rename or delete)
					# and if we are the same, then we should scan our children to look for renames and deletes
					if @isDirectory
						if isTheSame() is false
							# Scan children
							balUtil.readdir fileFullPath, (err,newFileRelativePaths) =>
								throw err  if err
								# Check for new files
								balUtil.each newFileRelativePaths, (newFileRelativePath) =>
									if @children[newFileRelativePath]?
										# already exists
									else
										# new file
										newFileFullPath = pathUtil.join(fileFullPath,newFileRelativePath)
										balUtil.stat newFileFullPath, (err,newFileStat) =>
											throw err  if err
											console.log('determined new:',newFileFullPath)  if debug
											@emit('changed','new',newFileFullPath,newFileStat,null)
											@watchChild(newFileFullPath,newFileRelativePath,newFileStat)
								# Check for deleted files
								balUtil.each @children, (childFileWatcher,childFileRelativePath) =>
									if childFileRelativePath in newFileRelativePaths
										# still exists
									else
										# deleted file
										childFileFullPath = childFileWatcher.path
										console.log('determined unlink:',childFileRelativePath)  if debug
										@closeChild(childFileRelativePath,'unlink')


					# If we are a file, lets simply emit the change event
					else
						# It has changed, so let's emit a change event
						console.log('determined change:',fileFullPath)  if debug
						@emit('changed','change',fileFullPath,currentStat,previousStat)

		# Check if the file still exists
		balUtil.exists fileFullPath, (exists) ->
			# Apply
			fileExists = exists

			# If the file still exists, then update the stat
			if fileExists
				balUtil.stat fileFullPath, (err,stat) ->
					# Check
					throw err  if err

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

	# We will need something to close our listener for removed or renamed files
	# As renamed files are a bit difficult we will want to close and delete all the watchers for all our children too
	# Essentially it is like a self-destruct without the body parts
	close: (type) ->
		return @  if @state isnt 'active'
		console.log("close: #{@path} ", new Error('trace').stack)  if debug

		# Close our children
		for own childRelativePath,watchr of @children
			@closeChild(childRelativePath,type)

		# Close listener
		if @method is 'watchFile'
			fsUtil.unwatchFile(@path)
		else if @method is 'watch'  and  @fswatcher
			@fswatcher.close()
			@fswatcher = null

		# Updated state
		if type is 'unlink'
			@emit('changed','unlink',@path,null,@stat)
			@state = 'unlink'
		else
			@state = 'closed'

		# Delete our watchers reference
		delete watchers[@path]  if watchers[@path]?

		# Chain
		@

	# Close a child
	closeChild: (fileRelativePath,type) ->
		# Prepare
		watcher = @children[fileRelativePath]

		# Check
		if watcher
			watcher.close(type)
			delete @children[fileRelativePath]

		# Chain
		@

	# Setup watching a child
	watchChild: (fileFullPath,fileRelativePath,fileStat,next) ->
		# Prepare
		me = @
		config = @config

		# Watch the file
		watch(
			# Necessary
			path: fileFullPath
			listener: (args...) ->
				if args.length > 3 and args[0] is 'changed' and args[1] is 'unlink' and args[2] is fileFullPath
					@closeChild(fileRelativePath,'unlink')
				me.bubble(args...)

			# Options
			stat: fileStat
			ignoreHiddenFiles: config.ignoreHiddenFiles
			ignoreCommonPatterns: config.ignoreCommonPatterns
			ignoreCustomPatterns: config.ignoreCustomPatterns

			# Next
			next: (err,watcher) ->
				# Stop if an error happened
				return next?(err)  if err

				# Store the child watchr in us
				me.children[fileRelativePath] = watcher

				# Proceed to the next file
				next?()
		)

	# Setup the watching for our path
	# If we are already watching this path then let's start again (call close)
	# Then if we are a directory, let's recurse
	# Finally, let's initialise our node.js watcher that'll let us know when things happen
	# and update our state to active
	# next(err)
	watch: (next) ->
		# Prepare
		me = @
		config = @config

		# Close our all watch listeners
		@close()

		# Log
		console.log("watch: #{@path}", new Error('trace').stack)  if debug

		# Prepare Start Watching
		startWatching = =>
			# Create a set of tasks
			tasks = new balUtil.Group (err) ->
				next?(err)
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
					me.changed.apply(me,args)
				@method = 'watchFile'
			catch err
				# Then try with fsUtil.watch
				@fswatcher = fsUtil.watch @path, (args...) ->
					me.changed.apply(me,args)
				@method = 'watch'

			# We are now watching so set the state as active
			@state = 'active'
			tasks.complete()

		# Check if we still exist
		balUtil.exists @path, (exists) ->
			# Check
			unless exists
				# We don't exist anymore, move along
				next()
				return @

			# Start watching
			startWatching()

		# Chain
		@

# Create a new watchr instance or use one from cache
createWatcher = (opts,next) ->
	# Prepare
	[opts,next] = balUtil.extractOptsAndCallback(opts,next)
	{path,listener,listeners} = opts
	watchr = null

	# Only create a watchr if the path exists
	unless balUtil.existsSync(path)
		next?(null,watcher)
		return

	# Check if we are already watching that path
	if watchers[path]?
		# We do, so let's use that one instead
		watcher = watchers[path]
		# and add the new listeners if we have any
		if listener
			watcher.listen(listener)
		if listeners
			for _listener in listeners
				watcher.listen(_listener)
		# as we don't create a new watcher, we must fire the next callback ourselves
		next?(null,watcher)
	else
		# We don't, so let's create a new one
		watcher = new Watcher(opts)
		watchers[path] = watcher
		# next is fired by the Watcher constructor

	# Return
	return watcher

# Provide our watch API interface, which supports one path or multiple paths
# If you are passing in multiple paths
#   do not rely on the return result containing all of the watchers
#   you must rely on the result inside the completion callback instead
watch = (opts,next) ->
	# Prepare
	[opts,next] = balUtil.extractOptsAndCallback(opts,next)
	{paths} = opts
	result = null
	delete opts.paths

	# We have multiple paths
	if paths instanceof Array
		# Prepare
		result = []
		tasks = new balUtil.Group (err) ->
			next?(err,result)
		for path in paths
			tasks.push {path}, (complete) ->
				localOpts = balUtil.extend({},opts)
				localOpts.path = @path
				localOpts.next = complete
				watchr = createWatcher(localOpts)
				result.push(watchr)  if watchr
		tasks.async()  # by async here we actually mean parallel, as our tasks are actually synchronous
	else
		result = createWatcher(opts,next)

	# Return
	return result


# Now let's provide node.js with our public API
# In other words, what the application that calls us has access to
module.exports = {watch,Watcher}
