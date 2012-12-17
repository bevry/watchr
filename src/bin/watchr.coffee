#!/usr/bin/env coffee
path = require('path')
watchr = require(__dirname+'/../lib/watchr')
cwd = process.cwd()
watchPath =
	if process.argv.length is 3
		path.resolve(cwd,process.argv[2])
	else
		cwd
changes = 0
watchr.watch(
	path: watchPath
	listeners:
		log: (args...) ->
			console.log('a log message occured:', args);
		error: (err) ->
			console.log('an error occured:', err);
		watching: (args...) ->
			console.log('a new watcher instance finished setting up', args);
		change: (args...) ->
			console.log('a change event occured:',args);
	next: (args...) ->
		console.log('watching for all our paths has completed', args);
)