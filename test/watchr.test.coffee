# Requires
path = require('path')
watchr = require(path.join __dirname, '..', 'lib', 'watchr.coffee')
assert = require('assert')
balUtil = require('bal-util')
fs = require('fs')

# =====================================
# Configuration

# Config
debug = false

# Test Data
outPath = path.join(__dirname,'out')
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

describe 'watchr', ->
	it 'should work as expected', (done) ->
		# Prepare
		@timeout(60*1000)

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
			fileFullPath = path.join(outPath,fileRelativePath)
			fs.writeFileSync(fileFullPath, "#{fileRelativePath} now has the random number #{Math.random()}")
		deleteFile = (fileRelativePath) ->
			fileFullPath = path.join(outPath,fileRelativePath)
			fs.unlinkSync(fileFullPath)
		makeDir = (fileRelativePath) ->
			fileFullPath = path.join(outPath,fileRelativePath)
			fs.mkdirSync(fileFullPath,'700')
		renameFile = (fileRelativePath1,fileRelativePath2) ->
			fileFullPath1 = path.join(outPath,fileRelativePath1)
			fileFullPath2 = path.join(outPath,fileRelativePath2)
			fs.renameSync(fileFullPath1,fileFullPath2)
		wait = (delay,fn) ->
			setTimeout(fn,delay)

		# Remove test dir
		balUtil.rmdir outPath, (err) ->
			throw err  if err

			# Write test files
			balUtil.writetree outPath, writetree, (err) ->
				throw err  if err

				# Start watching
				watchr.watch outPath, changeHappened, (err,watcher) ->
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
