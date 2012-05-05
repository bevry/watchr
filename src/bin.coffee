#!/usr/bin/env coffee
path = require('path')
watchr = require(path.join __dirname, '..', 'lib', 'watchr.coffee')
cwd = process.cwd()
watchPath =
	if process.argv.length is 3
		path.resolve(cwd,process.argv[2])
	else
		cwd
changes = 0
watchr.watch(
	path: watchPath,
	event: (args...) ->
		console.log 'a watch event occured:', ++changes, ':', args
	next: (err,wachter) ->
		throw err  if err
		console.log 'now watching:', watchPath
)