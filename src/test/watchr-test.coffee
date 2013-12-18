# Requires
pathUtil = require('path')
fsUtil = require('fs')
balUtil = require('bal-util')
extendr = require('extendr')
watchr = require(__dirname+'/../lib/watchr')
assert = require('assert')
joe = require('joe')

# =====================================
# Configuration

# Helpers
wait = (delay,fn) -> setTimeout(fn,delay)

# Test Data
debug = process.env.TRAVIS_NODE_VERSION?
batchDelay = 10*1000
outPath = pathUtil.join(__dirname,'../../test/out')
writetree =
	'a': 'a content'
	'b':
		'b-a': 'b-a content'
		'b-b': 'b-b content'
	'.c':
		'c-a': 'c-a content'
	'blah': 'blah content'


# =====================================
# Tests

runTests = (opts,describe,test) ->
	# Prepare
	watcher = null

	# Change detection
	changes = []
	checkChanges = (expectedChanges,next) ->
		wait batchDelay, ->
			console.log(changes)  if changes.length isnt expectedChanges
			assert.equal(changes.length, expectedChanges, "#{changes.length} changes ran out of #{expectedChanges} changes")
			changes = []
			next()
	changeHappened = (args...) ->
		changes.push(args)
		console.log("a watch event occured: #{changes.length}", args)  if debug

	# Files changes
	writeFile = (fileRelativePath) ->
		fileFullPath = pathUtil.join(outPath,fileRelativePath)
		fsUtil.writeFileSync(fileFullPath, "#{fileRelativePath} now has the random number #{Math.random()}")
	deleteFile = (fileRelativePath) ->
		fileFullPath = pathUtil.join(outPath,fileRelativePath)
		fsUtil.unlinkSync(fileFullPath)
	makeDir = (fileRelativePath) ->
		fileFullPath = pathUtil.join(outPath,fileRelativePath)
		fsUtil.mkdirSync(fileFullPath,'700')
	renameFile = (fileRelativePath1,fileRelativePath2) ->
		fileFullPath1 = pathUtil.join(outPath,fileRelativePath1)
		fileFullPath2 = pathUtil.join(outPath,fileRelativePath2)
		fsUtil.renameSync(fileFullPath1,fileFullPath2)

	# Tests
	test 'remove old test files', (done) ->
		balUtil.rmdirDeep outPath, (err) ->
			done(err)

	test 'write new test files', (done) ->
		balUtil.writetree outPath, writetree, (err) ->
			done(err)

	test 'start watching', (done) ->
		watchr.watch(extendr.extend({
			path: outPath
			listener: changeHappened
			ignorePaths: [pathUtil.join(outPath,'blah')]
			ignoreHiddenFiles: true
			outputLog: true
			next: (err,_watcher) ->
				watcher = _watcher
				wait batchDelay, -> done(err)
		},opts)).on 'error', (err) ->
			console.log err.stack

	test 'detect write', (done) ->
		writeFile('a')
		writeFile('b/b-a')
		checkChanges(2,done)

	test 'detect write ignored on hidden files', (done) ->
		writeFile('.c/c-a')
		checkChanges(0,done)

	test 'detect write ignored on ignored files', (done) ->
		writeFile('blah')
		checkChanges(0,done)

	test 'detect delete', (done) ->
		deleteFile('b/b-b')
		checkChanges(1,done)

	test 'detect delete ignored on hidden files', (done) ->
		deleteFile('.c/c-a')
		checkChanges(0,done)

	test 'detect delete ignored on ignored files', (done) ->
		deleteFile('blah')
		checkChanges(0,done)

	test 'detect mkdir', (done) ->
		makeDir('someNewDir1')
		checkChanges(1,done)

	test 'detect mkdir and write', (done) ->
		writeFile('someNewfile1')
		writeFile('someNewfile2')
		writeFile('someNewfile3')
		makeDir('someNewDir2')
		checkChanges(4,done)

	test 'detect rename', (done) ->
		renameFile('someNewfile1','someNewfilea')  # unlink, new
		checkChanges(2,done)

	test 'detect subdir file write', (done) ->
		writeFile('someNewDir1/someNewfile1')
		writeFile('someNewDir1/someNewfile2')
		checkChanges(2,done)

	test 'detect subdir file delete', (done) ->
		deleteFile('someNewDir1/someNewfile2')
		checkChanges(1,done)

	test 'stop watching', ->
		watcher.close()

# Run tests for each method
joe.describe 'watchr', (describe,test) ->
	describe 'watch', (describe,test) ->
		runTests({preferredMethods:['watch','watchFile']},describe,test)
	describe 'watchFile', (describe,test) ->
		runTests({preferredMethods:['watchFile','watch']},describe,test)
