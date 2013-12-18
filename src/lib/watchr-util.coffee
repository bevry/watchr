# Import
{extractOpts} = require('extract-opts')
fsUtil = require('safefs')

# Define
watchrUtil =
	# Stat Changed
	statChanged: (old, current) ->
		# Has the file been deleted or created?
		if old? isnt current?
			return true

		# Has the file contents changed?
		else if old? and current?
			old = extendr.dereference(old)
			current = extendr.dereference(current)

			delete old.atime  if old.atime?
			delete old.ctime  if old.ctime?
			delete current.atime  if current.atime?
			delete current.ctime  if current.ctime?

			# The files contents have actually changed
			if JSON.stringify(old) isnt JSON.stringify(current)
				return true

			# The files contents are the same
			else
				return false

		# The file still does not exist
		else
			return false

	# Try fsUtil.watch
	# opts = {path, listener}
	# next(err, success, 'watch')
	watch: (opts, next) ->
		# Prepare
		[opts, next] = extractOpts(opts, next)

		# Check
		return next(null, false, 'watch')  unless fsUtil.watch?

		# Watch
		try
			me.fswatcher = fsUtil.watch(opts.path, opts.listener)
			# must pass the listener here instead of via me.fswatcher.on('change', opts.listener)
			# as the latter is not supported on node 0.6 (only 0.8+)
		catch err
			return next(err, false, 'watch')

		# Apply
		return next(null, true, 'watch')

	# Try fsUtil.watchFile
	# opts = {path, persistent?, interval?, listener}
	# next(err, success, 'watchFile')
	watchFile: (opts, next) ->
		# Prepare
		[opts, next] = extractOpts(opts, next)

		# Check
		return next(null, false, 'watchFile')  unless fsUtil.watchFile?

		# Watch
		try
			fsUtil.watchFile(opts.path, {persistent: opts.persistent, inteval: opts.interval}, opts.listener)
		catch err
			return next(err, false, 'watchFile')

		# Apply
		return next(null, true, 'watchFile')

	# Try one watch method first, then try the other
	# opts = {path, methods?, parsistent?, interval?, listener}
	# next(err, success, method)
	watchMethods: (opts, next) ->
		# Prepare
		[opts, next] = extractOpts(opts, next)

		# Prepare
		opts.methods ?= ['watch', 'watchFile']

		# Preferences
		methodOne = watchrUtil[opts.methods[0]]
		methodTwo = watchrUtil[opts.methods[1]]

		# Try first
		methodOne opts, (errOne, success, method) ->
			# Move on if succeeded
			return next(null, success, method)  if success
			# Otherwise...

			# Try second
			methodTwo opts, (errTwo, success, method) ->
				# Move on if succeeded
				return complete(null, success, method)  if success
				# Otherwise...

				# Log errors and fail
				errCombined = new Error("Both watch methods failed on #{opts.path}:\n#{errOne.stack.toString()}\n#{errTwo.stack.toString()}")
				return complete(errCombined)

		# Chain
		return @