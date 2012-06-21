# Requires
pathUtil = require('path')
fsUtil = require('fs')
balUtil = require('bal-util')
watchr = require(__dirname+'/../lib/watchr')
assert = require('assert')
joe = require('joe')

# =====================================
# Configuration

# Config
debug = false

# Test Data
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

joe.describe 'watchr', (describe,it) ->
	it 'should work as expected', (done) ->
		# Prepare
		totalTasks = 14
		doneTasks = 0

		# Prepare
		complete = ->
			console.log "#{doneTasks} changes ran out of #{totalTasks} changes"  if debug
			assert.equal doneTasks, totalTasks
			done()

		# Timeout
		setTimeout(complete,55*1000)

		# Prepare handlers
		changeHappened = (args...) ->
			debugger
			console.log 'a watch event occured:', doneTasks+1,':', args  if debug
			++doneTasks

		# Change a file
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
		wait = (delay,fn) ->
			setTimeout(fn,delay)

		# Write test files
		balUtil.writetree outPath, writetree, (err) ->
			throw err  if err

			# Start watching
			watchr.watch path:outPath, listener:changeHappened, next:(err,watcher) ->
				throw err  if err

				# Tests
				wait 5000, ->
					writeFile('a')
					writeFile('b/b-a')
					writeFile('.c/c-a')
					deleteFile('b/b-b')

					wait 5000, ->
						writeFile('someNewfile1')
						writeFile('someNewfile2')
						writeFile('someNewfile3')

						makeDir('someNewDir1')
						makeDir('someNewDir2')

						wait 5000, ->
							renameFile('someNewfile1','someNewfilea')  # unlink, new

							writeFile('someNewDir1/someNewfile1')
							writeFile('someNewDir1/someNewfile2')

							wait 5000, ->
								deleteFile('someNewDir1/someNewfile2')
