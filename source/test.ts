/* @flow */
/* eslint no-console:0 no-sync:0 */

// builtin
import { version } from 'process'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, mkdirSync, unlinkSync, renameSync } from 'fs'
import { ok } from 'assert'

// external
import remove from '@bevry/fs-remove'
import { writeTree } from '@bevry/fs-tree'
import { equal } from 'assert-helpers'
import kava, { Errback, Suite, Test } from 'kava'

// local
import { Method, Stalker, WatcherOptions, create } from './index.js'

// Helpers
function wait(delay: number, fn: () => void) {
	console.log(`completed, waiting for ${delay}ms delay...`)
	return setTimeout(fn, delay)
}
function writeFile(fileRelativePath: string) {
	console.log('write:', fileRelativePath)
	const fileFullPath = join(fixturesPath, fileRelativePath)
	writeFileSync(
		fileFullPath,
		`${fileRelativePath} now has the random number ${Math.random()}`
	)
}
function deleteFile(fileRelativePath: string) {
	console.log('delete:', fileRelativePath)
	const fileFullPath = join(fixturesPath, fileRelativePath)
	unlinkSync(fileFullPath)
}
function makeDir(fileRelativePath: string) {
	console.log('make:', fileRelativePath)
	const fileFullPath = join(fixturesPath, fileRelativePath)
	mkdirSync(fileFullPath, 0o700)
}
function renameFile(fileRelativePath1: string, fileRelativePath2: string) {
	console.log('rename:', fileRelativePath1, 'TO', fileRelativePath2)
	const fileFullPath1 = join(fixturesPath, fileRelativePath1)
	const fileFullPath2 = join(fixturesPath, fileRelativePath2)
	renameSync(fileFullPath1, fileFullPath2)
}

// configuration
const batchDelay = 10 * 1000
const fixturesPath = join(tmpdir(), 'watchr', 'tests', version)
type Tree = { [basename: string]: string | Tree }
const tree = {
	'.a hidden directory': {
		'a sub file of a hidden directory':
			'content of a sub file of a hidden directory',
	},
	'a directory': {
		'a sub file of a directory': 'content of a sub file of a directory',
		'another sub file of a directory':
			'content of another sub file of a directory',
	},
	'a file': 'content of a file',
	'a specific ignored file': 'content of a specific ignored file',
}

// =====================================
// Tests

function runTests(opts: WatcherOptions, suite: Suite, test: Test) {
	// Prepare
	let stalker: Stalker | null = null

	// Change detection
	let changes: Array<any> = []
	function checkChanges(
		expectedChanges: number,
		extraTest: null | ((changes: Array<any>) => void),
		next: Errback
	) {
		wait(batchDelay, function () {
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
	function changeHappened(...args: Array<any>) {
		changes.push(args)
		console.log(`a watch event occurred: ${changes.length}`, args)
	}

	// Tests
	test('remove old test files', function (done) {
		remove(fixturesPath)
			.then(() => done())
			.catch((err) => done(err))
	})

	test('write new test files', function (done) {
		writeTree(fixturesPath, tree)
			.then(() => done())
			.catch((err: any) => done(err))
	})

	test('start watching', function (done) {
		stalker = create(fixturesPath)
		stalker.on('log', console.log)
		stalker.on('change', changeHappened)
		stalker.setConfig(
			Object.assign(
				{
					path: fixturesPath,
					ignorePaths: [join(fixturesPath, 'a specific ignored file')],
					ignoreHiddenFiles: true,
				},
				opts
			)
		)
		stalker.watch((err) => {
			wait(batchDelay, function () {
				done(err)
			})
		})
	})

	test('detect write', function (done) {
		writeFile('a file')
		writeFile('a directory/a sub file of a directory')
		checkChanges(2, null, done)
	})

	test('detect write ignored on hidden files', function (done) {
		writeFile('.a hidden directory/a sub file of a hidden directory')
		checkChanges(0, null, done)
	})

	test('detect write ignored on ignored files', function (done) {
		writeFile('a specific ignored file')
		checkChanges(0, null, done)
	})

	test('detect delete', function (done) {
		deleteFile('a directory/another sub file of a directory')
		checkChanges(
			1,
			function (changes) {
				// make sure previous stat is given
				if (!changes[0][3]) {
					console.log(changes[0])
				}
				ok(changes[0][3], 'previous stat not given to delete')
			},
			done
		)
	})

	test('detect delete ignored on hidden files', function (done) {
		deleteFile('.a hidden directory/a sub file of a hidden directory')
		checkChanges(0, null, done)
	})

	test('detect delete ignored on ignored files', function (done) {
		deleteFile('a specific ignored file')
		checkChanges(0, null, done)
	})

	test('detect mkdir', function (done) {
		makeDir('a new directory')
		checkChanges(1, null, done)
	})

	test('detect mkdir and write', function (done) {
		writeFile('a new file')
		writeFile('another new file')
		writeFile('and another new file')
		makeDir('another new directory')
		checkChanges(4, null, done)
	})

	test('detect rename', function (done) {
		renameFile('a new file', 'a new file that was renamed')
		checkChanges(2, null, done) // unlink, new
	})

	test('detect subdir file write', function (done) {
		writeFile('a new directory/a new file of a new directory')
		writeFile('a new directory/another new file of a new directory')
		checkChanges(2, null, done)
	})

	test('detect subdir file delete', function (done) {
		deleteFile('a new directory/another new file of a new directory')
		checkChanges(1, null, done)
	})

	test('stop watching', function () {
		if (stalker) {
			stalker.close()
		} else {
			throw new Error('unexpected state')
		}
	})
}

// Run tests for each method
kava.suite('watchr', function (suite) {
	suite('watch', function (suite, test) {
		runTests(
			{ preferredMethods: [Method.Watch, Method.WatchFile] },
			suite,
			test
		)
	})
	suite('watchFile', function (suite, test) {
		runTests(
			{ preferredMethods: [Method.WatchFile, Method.Watch] },
			suite,
			test
		)
	})
})
