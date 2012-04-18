###
Watchr is used to be nofitied when a change happens to, or within a directory.
You will not be notified what file was changed, or how it was changed.
It will track new files and their changes too, and remove listeners for deleted files appropriatly.

The source code here is written as an experiment of literate programming
Which means you would be able to understand it, without knowing code
###

# Require the node.js file system module
# This provides us with what we need to interact with the file system (aka files and directories)
fs = require('fs')

# Require the node.js event emitter
# This provides us with the event system that we use for binding and trigger events
EventEmitter = require('events').EventEmitter

# Require the balUtil module
# This provides us with various flow logic and path utilities
balUtil = require('bal-util')

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

	# Our fs.stat object, it contains things like change times, size, and is it a directory
	stat: null

	# The node.js file watcher instance, we have to open and close this, it is what notifies us of the events
	fswatcher: null

	# The watchers for the children of this watcher will go here
	# This is for when we are watching a directory, we will scan the directory and children go here
	children: null  # {}

	# We have to store the current state of the watcher and it is asynchronous (things can fire in any order)
	# as such, we don't want to be doing particular things if this watcher is deactivated (closed)
	state: 'pending'

	# The method we will use to watch the files
	# Preferably we use watchFile, however we may need to use watch in case watchFile doesn't exist (e.g. windows)
	method: null
	
	# Now it's time to construct our watcher
	# We give it a path, and give it some events to use
	# Then we get to work with watching it
	# next()
	constructor: (options) ->
		# Prepare
		options or= {}
		watcher = @
		@children = {}
		applyStat = (stat) =>
			@stat = stat
			@isDirectory = stat.isDirectory()
			@watch (err) ->
				options.next?(err,watcher)

		# Path
		@path = options.path

		# Options
		@options = options
		
		# Event
		if options.listener
			@listen(options.listener)

		# Events
		if options.listeners
			for listener in options.listeners
				@listen(listener)

		# Stat
		if options.stat
			# We already have a stat
			applyStat(options.stat)
		else
			# Fetch a stat
			fs.stat @path, (err,stat) =>
				# Check if we are no longer necessary
				if @state is 'closed'
					return

				# Check if an error occured
				if err
					throw err

				# Apply the stat
				applyStat(stat)
	

	# Before we start watching, we'll have to setup the functions our watcher will need
	
	# Listen to the change event for us
	listen: (listener) ->
		# Listen
		@removeListener('changed',listener)
		@on('changed',listener)
		console.log "added a listener: on #{@path}"  if debug

		# Chain
		@
	
	# We need something to bubble events up from a child file all the way up the top
	bubble: (args...) ->
		# Prepare
		[eventName,filename,currentStat,previousStat] = args

		# Log
		console.log "bubble: #{eventName}: #{filename} on #{@path}"  if debug

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
		console.log "watch event triggered on #{@path}"  if debug
		#console.log args  if debug

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
				@emit('changed','unlink',fileFullPath,currentStat,previousStat)

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
							# Check for new files
							fs.readdir fileFullPath, (err,newFileRelativePaths) =>
								throw err  if err
								balUtil.each newFileRelativePaths, (newFileRelativePath) =>
									if @children[newFileRelativePath]?
										# already exists
									else
										# new file
										newFileFullPath = path.join(fileFullPath,newFileRelativePath)
										fs.stat newFileFullPath, (err,newFileStat) =>
											throw err  if err
											console.log('determined new:',newFileFullPath)  if debug
											@emit('changed','new',newFileFullPath,newFileStat,null)
											@watchChild(newFileFullPath,newFileRelativePath,newFileStat)

					# If we are a file, lets simply emit the change event
					else
						# It has changed, so let's emit a change event
						console.log('determined change:',fileFullPath)  if debug
						@emit('changed','change',fileFullPath,currentStat,previousStat)
		
		# Check if the file still exists
		path.exists fileFullPath, (exists) ->
			# Apply
			fileExists = exists

			# If the file still exists, then update the stat
			if fileExists
				fs.stat fileFullPath, (err,stat) ->
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
	close: ->
		return @  if @state is 'closed'
		console.log "close: #{@path}"  if debug

		# Close our children
		for own childRelativePath,watchr of @children
			@closeChild(childRelativePath)

		# Close ourself
		if @state isnt 'closed'
			# Close listener
			if @method is 'watchFile'
				fs.unwatchFile(@path)
			else if @method is 'watch'  and  @fswatcher
				@fswatcher.close()
				@fswatcher = null
				
			# Updated state
			@state = 'closed'

		# Delete our watchers reference
		delete watchers[@path]  if watchers[@path]?

		# Chain
		@

	# Close a child
	closeChild: (fileRelativePath) ->
		# Prepare
		watcher = @children[fileRelativePath]

		# Check
		if watcher
			watcher.close()
			delete @children[index]

		# Chain
		@

	# Setup watching a child
	watchChild: (fileFullPath,fileRelativePath,fileStat,next) ->
		# Prepare
		me = @
		options = @options

		# Watch the file
		watch(
			# Necessary
			path: fileFullPath
			listener: (args...) ->
				me.bubble(args...)

			# Options
			stat: fileStat
			ignoreHiddenFiles: options.ignoreHiddenFiles
			ignorePatterns: options.ignorePatterns

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
		options = @options
		console.log "watch: #{@path}"  if debug

		# Close our all watch listeners
		@close()

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
					ignoreHiddenFiles: options.ignoreHiddenFiles
					ignorePatterns: options.ignorePatterns
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
				# Try first with fs.watchFile
				fs.watchFile @path, (args...) ->
					me.changed.apply(me,args)
				@method = 'watchFile'
			catch err
				# Then try with fs.watch
				@fswatcher = fs.watch @path, (args...) ->
					me.changed.apply(me,args)
				@method = 'watch'
			
			# We are now watching so set the state as active
			@state = 'active'
			tasks.complete()

		# Check if we still exist
		path.exists @path, (exists) ->
			# Check
			unless exists
				# We don't exist anymore, move along
				next()
				return @

			# Start watching
			startWatching()

		# Chain
		@


# Provide our interface to the applications that use watchr
# This will create our new Watcher class for the path we want
#  (or use an existing one, and add the events)
# Watcher also uses this too
watch = (args...) ->
	# Three arguments
	# [path,options,next]
	if args.length is 3
		# Prepare
		argTwo = args[1]
		options = {}

		# Single Event
		if typeof argTwo is 'function'
			options.listener = argTwo
		# Multiple Events
		else if Array.isArray(argTwo)
			options.listeners = argTwo
		# Options
		else if typeof argTwo is 'object'
			options = argTwo

		# Extract
		options.path = args[0]
		options.next = args[2]

	# One argument
	# [options]
	else if args.length is 1
		# Extract
		argOne = args[0]
		if typeof argOne is 'object'
			options = argOne
		else
			options = {}
			options.path = argOne

	# Extract path
	path = options.path
	next = options.next

	# Check if we are already watching that path
	if watchers[path]?
		# We do, so let's use that one instead
		watcher = watchers[path]
		next?(null,watcher)
		return watcher
	else
		# We don't, so let's create a new one
		watcher = new Watcher(options)
		watchers[path] = watcher
		return watcher


# Now let's provide node.js with our public API
# In other words, what the application that calls us has access to
module.exports = {watch,Watcher}