/* eslint no-console:0 */
// Require
const watchr = require('./index')

// Watch a directory or file
console.log('Watch our paths')
watchr.watch({
	paths: [process.cwd()],
	listeners: {
		log (...args) {
			console.log('a log message occured:', args)
		},
		error (err) {
			console.log('an error occured:', err)
		},
		watching (err, watcherInstance) {
			if (err) {
				console.log(`watching the path ${watcherInstance.path} failed with error`, err)
			}
			else {
				console.log(`watching the path ${watcherInstance.path} completed`)
			}
		},
		change (...args) {
			console.log('a change event occured:', args)
		}
	},
	next (err, watchers) {
		if (err) {
			return console.log('watching everything failed with error', err)
		}
		else {
			console.log('watching everything completed', watchers)
		}

		// Close watchers after 60 seconds
		setTimeout(function () {
			console.log('Stop watching our paths')
			for ( let i = 0; i < watchers.length; i++ ) {
				watchers[i].close()
			}
		}, 60 * 1000)
	}
})
