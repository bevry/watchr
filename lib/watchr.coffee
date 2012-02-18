###
Watchr is used to be nofitied when a change happens to, or within a directory.
You will not be notified what file was changed, or how it was changed.
It will track new files and their changes too, and remove listeners for deleted files appropriatly.

The source code here is written as an experiment of literate programming
Which means you would be able to understand it, without knowing code
###

# Require the file system module for node.js
# This provides us with what we need to interact with the file system (aka files and directories)
fs = require('fs')

# Let's set the debugging mode
# We will use this later on when outputting messages that make our code easier to debug
# Note: when we publish the module, we want to set this as off, as we don't want the application using us
#  to spurt out all our debug messages!
debug = false

# Now to make watching files more convient and managed, we'll create a class which we can use to attach to each file
# It'll provide us with the API and abstraction we need to accomplish difficult things like recursion
# We'll also store a global store of all the watchers and their paths so we don't have multiple watchers going at the same time
#  for the same file - as that would be quite ineffecient
watchers = {}
Watcher = class
	# The path this class instance is attached to
	path: null

	# Is it a directory or not?
	isDirectory: null

	# Our fs.stat object, it contains things like change times, size, and is it a directory
	stat: null

	# The events that we will trigger when we detect a change
	# We make this as an array as otherwise we would have to have one listener for every event
	#  as that would be quite slow
	# So instead we have one listener, with many events
	events: []

	# The node.js file watcher instance, we have to open and close this, it is what notifies us of the events
	fswatcher: null

	# We also want to setup a delay between change events, as if we changed a lot of files,
	#  we just want to be notified once, instead of like 1000 times
	timeout: null
	delay: 500

	# The watchers for the children of this watcher will go here
	# This is for when we are watching a directory, we will scan the directory and children go here
	children: []

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
	constructor: (path,events=[],next) ->
		@children = []
		@events = []
		@path = path
		@addEvents events
		fs.stat @path, (err,stat) =>
			return  if @state is 'closed'
			throw err  if err
			@stat = stat
			@isDirectory = stat.isDirectory()
			@watch(next)
	
	# Let's now add our events
	# We should support being passed a list of events, as well as one event, or no events (for error prevention)
	# We should also not add an event if it is already added
	addEvents: (events) ->
		unless events instanceof Array
			if events
				events = [events]
			else
				events = []
		for event in events
			found = false
			for storedEvent in @events
				if storedEvent is event
					found = true
					break
			if not found
				@events.push(event)
		@
	
	# Before we start watching, we'll have to setup the functions our watcher will need

	# It will need function to trigger all of our watcher's events
	trigger: ->
		console.log "trigger: #{@path}"  if debug
		for event in @events
			event()
		@
	
	# We also need something so when a file is changed, we wait a while until things have calmed down
	#  and once they have calmed down, then trigger our events
	changed: ->
		console.log "changed: #{@path}"  if debug
		if @timeout
			clearTimeout(@timeout)
			@timeout = false
		@timeout = setTimeout(
			=> @trigger()
			@delay
		)
		@
	
	# We will need something to close our listener for removed or renamed files
	# As renamed files are a bit difficult we will want to close and delete all the watchers for all our children too
	# Essentially it is like a self-destruct without the body parts
	close: ->
		return @  if @state is 'closed'
		console.log "close: #{@path}"  if debug

		# Close and destroy children
		for watcher,index in @children
			watcher.close()
			delete @children[index]
		@children = []

		# Close ourself
		if @state isnt 'closed'
			# Close listener
			if @method is 'watchFile'
				fs.unwatchFile @path
			else if @method is 'watch'  and  @fswatcher
				@fswatcher.close()
				@fswatcher = null
				
			# Updated state
			@state = 'closed'

		# Delete our watchers reference
		delete watchers[@path]  if watchers[@path]?

		# Chain
		@
	
	# We need something to figure out what to do when a file is changed
	# It will check if we are still active, and if so, then handle the fs.watchFile event
	handlerWatchFile: (curr,prev) ->
		# Log
		console.log "handlerWatchFile: #{@path}"  if debug
		console.log arguments  if debug

		# Ignore if we are closed
		return  if @state is 'closed'

		# Handle fs.watchFile event
		return  if curr.mtime.getTime() is prev.mtime.getTime()  and  curr.size is prev.size
		@changed()
		@watch()

		# Done
		return
	
	# We need something to figure out what to do when a file is changed
	# It will check if we are still active, and if so, then handle the fs.watch event
	handlerWatch: (event,filename) ->
		# Log
		console.log "handlerWatch: #{@path}"  if debug
		console.log arguments  if debug

		# Ignore if we are closed
		return  if @state is 'closed'

		# Ignore if what changed was a hidden file
		return  if filename and /^[\.~]/.test filename

		# Renames and new files
		# If we are a file then stop our close our watcher, as an event will also have fired for the parent directory
		# If we are the parent directory, then trigger our change event,
		#  then re-initialise all our listernes, as we want to close listerners for deleted files
		#  and add new listeners for added files
		if event is 'rename'
			if @isDirectory is false
				@close()
			else
				@changed()
				try
					@watch()
			
		# Changed files
		# If we were a change, then let's check that something did actually change
		# If it did, then trigger our change event
		else if event is 'change'
			fs.stat @path, (err,stat) =>
				# Ignore if we are closed
				return  if @state is 'closed'
				throw err  if err
				return  if stat.mtime.getTime() is @stat.mtime.getTime()  and  stat.size is @stat.size
				@stat = stat
				@changed()

		# Done
		return
	
	# Setup the watching for our path
	# If we are already watching this path then let's start again (call close)
	# Then if we are a directory, let's recurse
	# Finally, let's initialise our node.js watcher that'll let us know when things happen
	# and update our state to active
	watch: (next) ->
		# Prepare
		@close()
		console.log "watch: #{@path}"  if debug

		# Tasks
		completed = 0
		expected = 2
		complete = ->
			++completed
			if completed is expected
				next?()
		
		# Cycle through the directory if necessary
		if @isDirectory
			fs.readdir @path, (err,files) =>
				throw err  if err
				expected += files.length
				complete()
				for file in files
					# Ignore hidden files/dirs
					if /^[\.~]/.test file
						--expected
						continue
					
					# Watch the file/dir
					filePath = @path+'/'+file
					watcher = watch(
						filePath
						=>
							@changed()
						complete
					)

					# Store the child watchr in us
					@children.push watcher
		else
			complete()
		
		# Watch the current file/directory
		try
			# Try first with fs.watchFile
			fs.watchFile @path, (args...) =>
				@handlerWatchFile.apply(@,args)
			@method = 'watchFile'
		catch err
			# Then try with fs.watch
			@fswatcher = fs.watch @path, (args...) =>
				@handlerWatch.apply(@,args)
			@method = 'watch'
		
		# We are now watching so set the state as active
		@state = 'active'
		complete()
		@


# Provide our interface to the applications that use watchr
# This will create our new Watcher class for the path we want
#  (or use an existing one, and add the events)
# Watcher also uses this too
watch = (path,events,next) ->
	# Check if what we received is an Array. If so we will assume it's an 
	# array and start watching each path within
	if Array.isArray path
		path.forEach (p) -> watch p, events, next
		return
	# Check if we are already watching that path
	if watchers[path]?
		# We do, so let's use that one instead
		watchers[path].addEvents(events)
		next?()
	else
		# We don't, so let's create a new one
		watchers[path] = new Watcher(path,events,next)


# Now let's provide node.js with our public API
# In other words, what the application that calls us has access to
module.exports = {watch}
