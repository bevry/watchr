# Requires
pathUtil = require('path')
fsUtil = require('fs')
balUtil = require('bal-util')
watchr = require(__dirname+'/../lib/watchr')
assert = require('assert')
joe = require('joe')

# =====================================
# Configuration

# Helpers
wait = (delay,fn) -> setTimeout(fn,delay)

# Test Data
debug = process.env.TRAVIS_NODE_VERSION?
batchDelay = 5*1000
outPath = pathUtil.join(__dirname,'../../test/out')
writetree =
	'a': 'a content'
	'b':
		'b-a': 'b-a content'
		'b-b': 'b-b content'
	'.c':
		'c-a': 'c-a content'


# =====================================
# Tests

# -------------------------------------
# Watchr

joe.suite 'watchr', (suite,test) ->
	# Change detection
	actualChanges = 0
	checkChanges = (expectedChanges,next) ->
		wait batchDelay, ->
			assert.equal(actualChanges, expectedChanges, "#{actualChanges} changes ran out of #{expectedChanges} changes")
			actualChanges = 0
			next()
	changeHappened = (args...) ->
		++actualChanges
		console.log("a watch event occured: #{actualChanges}", args)  if debug

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
		watchr.watch path:outPath, listener:changeHappened, next:(err,watcher) ->
			wait batchDelay, -> done(err)

	test 'detect level 1 changes', (done) ->
		writeFile('a')
		writeFile('b/b-a')
		writeFile('.c/c-a')
		deleteFile('b/b-b')
		checkChanges(4,done)

	test 'detect level 2 changes', (done) ->
		writeFile('someNewfile1')
		writeFile('someNewfile2')
		writeFile('someNewfile3')
		makeDir('someNewDir1')
		makeDir('someNewDir2')
		checkChanges(5,done)

	test 'detect level 3 changes', (done) ->
		renameFile('someNewfile1','someNewfilea')  # unlink, new
		checkChanges(2,done)

	test 'detect level 4 changes', (done) ->
		writeFile('someNewDir1/someNewfile1')
		writeFile('someNewDir1/someNewfile2')
		checkChanges(2,done)

	test 'detect level 5 changes', (done) ->
		deleteFile('someNewDir1/someNewfile2')
		checkChanges(1,done)

	test 'completed', (done) ->
		done()
		joe.exit()