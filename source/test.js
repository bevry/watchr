/* @flow */
/* eslint no-console:0 no-sync:0 */
'use strict'

// Requires
const pathUtil = require('path')
const fsUtil = require('fs')
const balUtil = require('bal-util')
const rimraf = require('rimraf')
const extendr = require('extendr')
const { equal } = require('assert-helpers')
const { ok } = require('assert')
const kava = require('kava')
const { create } = require('./index')

// =====================================
// Configuration

// Helpers
function wait(delay, fn) {
	console.log(`completed, waiting for ${delay}ms delay...`)
	return setTimeout(fn, delay)
}

// Test Data
const batchDelay = 10 * 1000
const fixturesPath = pathUtil.join(
	require('os').tmpdir(),
	'watchr',
	'tests',
	process.version
)
const writetree = {
	'a file': 'content of a file',
	'a directory': {
		'a sub file of a directory': 'content of a sub file of a directory',
		'another sub file of a directory':
			'content of another sub file of a directory'
	},
	'.a hidden directory': {
		'a sub file of a hidden directory':
			'content of a sub file of a hidden directory'
	},
	'a specific ignored file': 'content of a specific ignored file'
}

// =====================================
// Tests

function runTests(opts, describe, test) {
	// Prepare
	let stalker = null

	// Change detection
	let changes = []
	function checkChanges(expectedChanges, extraTest, next) {
		wait(batchDelay, function() {
			if (changes.length !== expectedChanges) {
				console.log(changes)
			}
			equal(
				changes.length,
				expectedChanges,
				`${changes.length} changes ran out of ${expectedChanges} changes`
			)
			if (extraTest) {
				extraTest(changes)
			}
			changes = []
			next()
		})
	}
	function changeHappened(...args) {
		changes.push(args)
		console.log(`a watch event occured: ${changes.length}`, args)
	}

	// Files changes
	function writeFile(fileRelativePath) {
		console.log('write:', fileRelativePath)
		const fileFullPath = pathUtil.join(fixturesPath, fileRelativePath)
		fsUtil.writeFileSync(
			fileFullPath,
			`${fileRelativePath} now has the random number ${Math.random()}`
		)
	}
	function deleteFile(fileRelativePath) {
		console.log('delete:', fileRelativePath)
		const fileFullPath = pathUtil.join(fixturesPath, fileRelativePath)
		fsUtil.unlinkSync(fileFullPath)
	}
	function makeDir(fileRelativePath) {
		console.log('make:', fileRelativePath)
		const fileFullPath = pathUtil.join(fixturesPath, fileRelativePath)
		fsUtil.mkdirSync(fileFullPath, 0o700)
	}
	function renameFile(fileRelativePath1, fileRelativePath2) {
		console.log('rename:', fileRelativePath1, 'TO', fileRelativePath2)
		const fileFullPath1 = pathUtil.join(fixturesPath, fileRelativePath1)
		const fileFullPath2 = pathUtil.join(fixturesPath, fileRelativePath2)
		fsUtil.renameSync(fileFullPath1, fileFullPath2)
	}

	// Tests
	test('remove old test files', function(done) {
		rimraf(fixturesPath, function(err) {
			done(err)
		})
	})

	test('write new test files', function(done) {
		balUtil.writetree(fixturesPath, writetree, function(err) {
			done(err)
		})
	})

	test('start watching', function(done) {
		stalker = create(fixturesPath)
		stalker.on('log', console.log)
		stalker.on('change', changeHappened)
		stalker.setConfig(
			extendr.extend(
				{
					path: fixturesPath,
					ignorePaths: [pathUtil.join(fixturesPath, 'a specific ignored file')],
					ignoreHiddenFiles: true
				},
				opts
			)
		)
		stalker.watch(err => {
			wait(batchDelay, function() {
				done(err)
			})
		})
	})

	test('detect write', function(done) {
		writeFile('a file')
		writeFile('a directory/a sub file of a directory')
		checkChanges(2, null, done)
	})

	test('detect write ignored on hidden files', function(done) {
		writeFile('.a hidden directory/a sub file of a hidden directory')
		checkChanges(0, null, done)
	})

	test('detect write ignored on ignored files', function(done) {
		writeFile('a specific ignored file')
		checkChanges(0, null, done)
	})

	test('detect delete', function(done) {
		deleteFile('a directory/another sub file of a directory')
		checkChanges(
			1,
			function(changes) {
				// make sure previous stat is given
				if (!changes[0][3]) {
					console.log(changes[0])
				}
				ok(changes[0][3], 'previous stat not given to delete')
			},
			done
		)
	})

	test('detect delete ignored on hidden files', function(done) {
		deleteFile('.a hidden directory/a sub file of a hidden directory')
		checkChanges(0, null, done)
	})

	test('detect delete ignored on ignored files', function(done) {
		deleteFile('a specific ignored file')
		checkChanges(0, null, done)
	})

	test('detect mkdir', function(done) {
		makeDir('a new directory')
		checkChanges(1, null, done)
	})

	test('detect mkdir and write', function(done) {
		writeFile('a new file')
		writeFile('another new file')
		writeFile('and another new file')
		makeDir('another new directory')
		checkChanges(4, null, done)
	})

	test('detect rename', function(done) {
		renameFile('a new file', 'a new file that was renamed')
		checkChanges(2, null, done) // unlink, new
	})

	test('detect subdir file write', function(done) {
		writeFile('a new directory/a new file of a new directory')
		writeFile('a new directory/another new file of a new directory')
		checkChanges(2, null, done)
	})

	test('detect subdir file delete', function(done) {
		deleteFile('a new directory/another new file of a new directory')
		checkChanges(1, null, done)
	})

	test('stop watching', function() {
		if (stalker) {
			stalker.close()
		} else {
			throw new Error('unexpected state')
		}
	})
}

// Run tests for each method
kava.describe('watchr', function(describe) {
	describe('watch', function(describe, test) {
		runTests({ preferredMethods: ['watch', 'watchFile'] }, describe, test)
	})
	describe('watchFile', function(describe, test) {
		runTests({ preferredMethods: ['watchFile', 'watch'] }, describe, test)
	})
})
