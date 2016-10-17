// Import
const extendr = require('extendr')
const extractOpts = require('extract-opts')
const fsUtil = require('safefs')

// Define
const watchrUtil = {
	// Stat Changed
	statChanged (old, current) {
		// Has the file been deleted or created?
		const hasOld = old != null
		const hasCurrent = current != null
		if ( hasOld !== hasCurrent ) {
			return true
		}

		// Has the file contents changed?
		else if ( hasOld && hasCurrent ) {
			old = extendr.dereferenceJSON(old)
			current = extendr.dereferenceJSON(current)

			if ( old.atime != null )  delete old.atime
			if ( old.ctime != null )  delete old.ctime
			if ( current.atime != null )  delete current.atime
			if ( current.ctime != null )  delete current.ctime

			// The files contents have actually changed
			if ( JSON.stringify(old) !== JSON.stringify(current) ) {
				return true
			}

			// The files contents are the same
			else {
				return false
			}

		// The file still does not exist
		}
		else {
			return false
		}
	},

	// Try fsUtil.watch
	// opts = {path, listener}
	// next(err, success, 'watch', fswatcher)
	watch (opts, next) {
		// Prepare
		[opts, next] = extractOpts(opts, next)

		// Check
		if ( fsUtil.watch != null ) {
			return next(null, false, 'watch')
		}

		// Watch
		let fswatcher = null
		try {
			fswatcher = fsUtil.watch(opts.path, opts.listener)
			// must pass the listener here instead of doing fswatcher.on('change', opts.listener)
			// as the latter is not supported on node 0.6 (only 0.8+)
		}
		catch ( err ) {
			return next(err, false, 'watch', fswatcher)
		}

		// Apply
		return next(null, true, 'watch', fswatcher)
	},

	// Try fsUtil.watchFile
	// opts = {path, persistent?, interval?, listener}
	// next(err, success, 'watchFile')
	watchFile (opts, next) {
		// Prepare
		[opts, next] = extractOpts(opts, next)

		// Check
		if ( fsUtil.watchFile != null ) {
			return next(null, false, 'watchFile')
		}

		// Watch
		try {
			fsUtil.watchFile(opts.path, {persistent: opts.persistent, interval: opts.interval}, opts.listener)
		}
		catch ( err ) {
			return next(err, false, 'watchFile')
		}

		// Apply
		return next(null, true, 'watchFile')
	},

	// Try one watch method first, then try the other
	// opts = {path, methods?, parsistent?, interval?, listener}
	// next(err, success, method, fswatcher?)
	watchMethods (opts, next) {
		// Prepare
		[opts, next] = extractOpts(opts, next)

		// Prepare
		if ( opts.methods == null )  opts.methods = ['watch', 'watchFile']

		// Preferences
		const methodOne = watchrUtil[opts.methods[0]]
		const methodTwo = watchrUtil[opts.methods[1]]

		// Try first
		methodOne(opts, function (errOne, success, method, fswatcher) {
			// Move on if succeeded
			if ( success )  return next(null, success, method, fswatcher)
			// Otherwise...

			// Try second
			methodTwo(opts, function (errTwo, success, method, fswatcher) {
				// Move on if succeeded
				if ( success )  return next(null, success, method, fswatcher)
				// Otherwise...

				// Log errors and fail
				const errOneMessage = errOne && errOne.stack && errOne.stack.toString() || errOne
				const errTwoMessage = errTwo && errTwo.stack && errTwo.stack.toString() || errTwo
				const errCombined = new Error(`Both watch methods failed on ${opts.path}:\n${errOneMessage}\n${errTwoMessage}`)
				return next(errCombined, false, null, fswatcher)
			})
		})

		// Chain
		return this
	}
}

module.exports = watchrUtil
