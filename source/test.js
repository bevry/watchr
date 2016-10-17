/* eslint no-console:0 no-sync:0 */

// Requires
const pathUtil = require('path')
const fsUtil = require('fs')
const balUtil = require('bal-util')
const rimraf = require('rimraf')
const extendr = require('extendr')
const assert = require('assert-helpers')
const joe = require('joe')
const watchr = require('./index')

// =====================================
// Configuration

// Helpers
function wait (delay, fn) {
	return setTimeout(fn, delay)
}

// Test Data
const debug = /* process.env.TRAVIS_NODE_VERSION || */ true
const batchDelay = 10 * 1000
const outPath = pathUtil.join(__dirname, '../../test/out')
const writetree = {
	'a': 'a content',
	'b': {
		'b-a': 'b-a content',
		'b-b': 'b-b content'
	},
	'.c': {
		'c-a': 'c-a content'
	},
	'blah': 'blah content'
}


// =====================================
// Tests

function runTests (opts, describe, test) {
	// Prepare
	let watcher = null

	// Change detection
	let changes = []
	function checkChanges (expectedChanges, extraTest, next) {
		if ( !next ) {
			next = extraTest
			extraTest = null
		}
		wait(batchDelay, function () {
			if ( changes.length !== expectedChanges ) {
				console.log(changes)
			}
			assert.equal(changes.length, expectedChanges, `${changes.length} changes ran out of ${expectedChanges} changes`)
			if ( extraTest ) {
				extraTest(changes)
			}
			changes = []
			next()
		})
	}
	function changeHappened (...args) {
		changes.push(args)
		if ( debug ) {
			console.log(`a watch event occured: ${changes.length}`, args)
		}
	}

	// Files changes
	function writeFile (fileRelativePath) {
		const fileFullPath = pathUtil.join(outPath, fileRelativePath)
		fsUtil.writeFileSync(fileFullPath, `${fileRelativePath} now has the random number ${Math.random()}`)
	}
	function deleteFile (fileRelativePath) {
		const fileFullPath = pathUtil.join(outPath, fileRelativePath)
		fsUtil.unlinkSync(fileFullPath)
	}
	function makeDir (fileRelativePath) {
		const fileFullPath = pathUtil.join(outPath, fileRelativePath)
		fsUtil.mkdirSync(fileFullPath, '700')
	}
	function renameFile (fileRelativePath1, fileRelativePath2) {
		const fileFullPath1 = pathUtil.join(outPath, fileRelativePath1)
		const fileFullPath2 = pathUtil.join(outPath, fileRelativePath2)
		fsUtil.renameSync(fileFullPath1, fileFullPath2)
	}

	// Tests
	test('remove old test files', function (done) {
		rimraf(outPath, function (err) {
			done(err)
		})
	})

	test('write new test files', function (done) {
		balUtil.writetree(outPath, writetree, function (err) {
			done(err)
		})
	})

	test('start watching', function (done) {
		watchr.watch(extendr.extend({
			path: outPath,
			listener: changeHappened,
			ignorePaths: [pathUtil.join(outPath, 'blah')],
			ignoreHiddenFiles: true,
			outputLog: debug,
			next (err, _watcher) {
				watcher = _watcher
				wait(batchDelay, function () {
					done(err)
				})
			}
		}, opts)).on('error', function (err) {
			console.log(err, err && err.stack)
		})
	})

	test('detect write', function (done) {
		writeFile('a')
		writeFile('b/b-a')
		checkChanges(2, done)
	})

	test('detect write ignored on hidden files', function (done) {
		writeFile('.c/c-a')
		checkChanges(0, done)
	})

	test('detect write ignored on ignored files', function (done) {
		writeFile('blah')
		checkChanges(0, done)
	})

	test('detect delete', function (done) {
		deleteFile('b/b-b')
		checkChanges(
			1,
			function (changes) {
				// make sure previous stat is given
				if ( !changes[0][3] ) {
					console.log(changes[0])
				}
				assert.ok(changes[0][3], 'previous stat not given to delete')
			},
			done
		)
	})

	test('detect delete ignored on hidden files', function (done) {
		deleteFile('.c/c-a')
		checkChanges(0, done)
	})

	test('detect delete ignored on ignored files', function (done) {
		deleteFile('blah')
		checkChanges(0, done)
	})

	test('detect mkdir', function (done) {
		makeDir('someNewDir1')
		checkChanges(1, done)
	})

	test('detect mkdir and write', function (done) {
		writeFile('someNewfile1')
		writeFile('someNewfile2')
		writeFile('someNewfile3')
		makeDir('someNewDir2')
		checkChanges(4, done)
	})

	test('detect rename', function (done) {
		renameFile('someNewfile1', 'someNewfilea')  // unlink, new
		checkChanges(2, done)
	})

	test('detect subdir file write', function (done) {
		writeFile('someNewDir1/someNewfile1')
		writeFile('someNewDir1/someNewfile2')
		checkChanges(2, done)
	})

	test('detect subdir file delete', function (done) {
		deleteFile('someNewDir1/someNewfile2')
		checkChanges(1, done)
	})

	test('stop watching', function () {
		watcher.close()
	})
}

// Run tests for each method
joe.describe('watchr', function (describe) {
	describe('watch', function (describe, test) {
		runTests({preferredMethods: ['watch', 'watchFile']}, describe, test)
	})
	describe('watchFile', function (describe, test) {
		runTests({preferredMethods: ['watchFile', 'watch']}, describe, test)
	})
})
