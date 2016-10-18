<!-- TITLE/ -->

<h1>watchr</h1>

<!-- /TITLE -->


<!-- BADGES/ -->

<span class="badge-travisci"><a href="http://travis-ci.org/bevry/watchr" title="Check this project's build status on TravisCI"><img src="https://img.shields.io/travis/bevry/watchr/master.svg" alt="Travis CI Build Status" /></a></span>
<span class="badge-npmversion"><a href="https://npmjs.org/package/watchr" title="View this project on NPM"><img src="https://img.shields.io/npm/v/watchr.svg" alt="NPM version" /></a></span>
<span class="badge-npmdownloads"><a href="https://npmjs.org/package/watchr" title="View this project on NPM"><img src="https://img.shields.io/npm/dm/watchr.svg" alt="NPM downloads" /></a></span>
<span class="badge-daviddm"><a href="https://david-dm.org/bevry/watchr" title="View the status of this project's dependencies on DavidDM"><img src="https://img.shields.io/david/bevry/watchr.svg" alt="Dependency Status" /></a></span>
<span class="badge-daviddmdev"><a href="https://david-dm.org/bevry/watchr#info=devDependencies" title="View the status of this project's development dependencies on DavidDM"><img src="https://img.shields.io/david/dev/bevry/watchr.svg" alt="Dev Dependency Status" /></a></span>
<br class="badge-separator" />
<span class="badge-slackin"><a href="https://slack.bevry.me" title="Join this project's slack community"><img src="https://slack.bevry.me/badge.svg" alt="Slack community badge" /></a></span>
<span class="badge-patreon"><a href="http://patreon.com/bevry" title="Donate to this project using Patreon"><img src="https://img.shields.io/badge/patreon-donate-yellow.svg" alt="Patreon donate button" /></a></span>
<span class="badge-gratipay"><a href="https://www.gratipay.com/bevry" title="Donate weekly to this project using Gratipay"><img src="https://img.shields.io/badge/gratipay-donate-yellow.svg" alt="Gratipay donate button" /></a></span>
<span class="badge-flattr"><a href="https://flattr.com/profile/balupton" title="Donate to this project using Flattr"><img src="https://img.shields.io/badge/flattr-donate-yellow.svg" alt="Flattr donate button" /></a></span>
<span class="badge-paypal"><a href="https://bevry.me/paypal" title="Donate to this project using Paypal"><img src="https://img.shields.io/badge/paypal-donate-yellow.svg" alt="PayPal donate button" /></a></span>
<span class="badge-bitcoin"><a href="https://bevry.me/bitcoin" title="Donate once-off to this project using Bitcoin"><img src="https://img.shields.io/badge/bitcoin-donate-yellow.svg" alt="Bitcoin donate button" /></a></span>
<span class="badge-wishlist"><a href="https://bevry.me/wishlist" title="Buy an item on our wishlist for us"><img src="https://img.shields.io/badge/wishlist-donate-yellow.svg" alt="Wishlist browse button" /></a></span>

<!-- /BADGES -->


Watchr provides a normalised API the file watching APIs of different node versions, nested/recursive file and directory watching, and accurate detailed events for file/directory creations, updates, and deletions.


<!-- INSTALL/ -->

<h2>Install</h2>

<a href="https://npmjs.com" title="npm is a package manager for javascript"><h3>NPM</h3></a><ul>
<li>Install: <code>npm install --save watchr</code></li>
<li>Executable: <code>watchr</code></li>
<li>Module: <code>require('watchr')</code></li></ul>

<h3><a href="https://github.com/bevry/editions" title="Editions are the best way to produce and consume packages you care about.">Editions</a></h3>

<p>This package is published with the following editions:</p>

<ul><li><code>watchr</code> aliases <code>watchr/index.js</code></li>
<li><code>watchr/index.js</code> is Source + <a href="https://babeljs.io/docs/learn-es2015/" title="ECMAScript Next">ESNext</a> + <a href="https://nodejs.org/dist/latest-v5.x/docs/api/modules.html" title="Node/CJS Modules">Require</a></li>
<li><code>watchr</code> aliases <code>watchr/index.js</code></li>
<li><code>watchr/index.js</code> is <a href="https://babeljs.io" title="The compiler for writing next generation JavaScript">Babel</a> Compiled + <a href="http://babeljs.io/docs/plugins/preset-es2015/" title="ECMAScript 2015">ES2015</a> + <a href="https://nodejs.org/dist/latest-v5.x/docs/api/modules.html" title="Node/CJS Modules">Require</a></li></ul>

<p>Older environments may need <a href="https://babeljs.io/docs/usage/polyfill/" title="A polyfill that emulates missing ECMAScript environment features">Babel's Polyfill</a> or something similar.</p>

<!-- /INSTALL -->


## Usage

There are two concepts in watchr, they are:

- Watcher - this wraps the native file system watching, makes it reliable, and supports deep watching
- Stalker - this wraps the watcher, such that for any given path, there can be many stalkers, but only one watcher

The simplest usage is:

``` javascript
// Import the watching library
var watchr = require('watchr')

// Define our watching parameters
var path = process.cwd()
function listener (changeType, fullPath, currentStat, previousStat) {
	switch ( changeType ) {
		case 'update':
			console.log('the file', fullPath, 'was updated', currentStat, previousStat)
			break
		case 'create':
			console.log('the file', fullPath, 'was created', currentStat)
			break
		case 'delete':
			console.log('the file', fullPath, 'was deleted', previousStat)
			break
	}
}
function next (err) {
	if ( err )  return console.log('watch failed on', path, 'with error', err)
	console.log('watch successful on', path)
}

// Watch the path with the change listener and completion callback
var stalker = watchr.open(path, listener, next)

// Close the stalker of the watcher
stalker.close()
```

More advanced usage is:

``` javascript
var stalker = watchr.create(path)
stalker.on('change', listener)
stalker.on('log', console.log)
stalker.once('close', function (reason) {
	console.log('closed', path, 'because', reason)
})
stalker.setConfig({
	// Stat (optional, defaults to `null`)
	// A stat object for the path if we already have one, otherwise it will be fetched for us
	stat: null,

	// Interval (optional, defaults to `5007`)
	// for systems that poll to detect file changes, how often should it poll in millseconds
	// if you are watching a lot of files, make this value larger otherwise you will have huge memory load
	// only applicable to the `watchFile` watching method
	interval: 5007,

	// Persistent (optional, defaults to `true`)
	// whether or not we should keep the node process alive for as long as files are still being watched
	// only applicable to the `watchFile` watching method
	persistent: true,

	// Catchup Delay (optional, defaults to `1000`)
	// Because of swap files, the original file may be deleted, and then over-written with by moving a swap file in it's place
	// Without a catchup delay, we would report the original file's deletion, and ignore the swap file changes
	// With a catchup delay, we would wait until there is a pause in events, then scan for the correct changes
	catchupDelay: 2 * 1000,

	// Preferred Methods (optional, defaults to `['watch','watchFile']`)
	// In which order should use the watch methods when watching the file
	preferredMethods: ['watch', 'watchFile'],

	// Follow symlinks, i.e. use stat rather than lstat. (optional, default to `true`)
	followLinks: true,

	// Ignore Paths (optional, defaults to `false`)
	// array of paths that we should ignore
	ignorePaths: false,

	// Ignore Hidden Files (optional, defaults to `false`)
	// whether or not to ignored files which filename starts with a `.`
	ignoreHiddenFiles: false,

	// Ignore Common Patterns (optional, defaults to `true`)
	// whether or not to ignore common undesirable file patterns (e.g. `.svn`, `.git`, `.DS_Store`, `thumbs.db`, etc)
	ignoreCommonPatterns: true,

	// Ignore Custom Patterns (optional, defaults to `null`)
	// any custom ignore patterns that you would also like to ignore along with the common patterns
	ignoreCustomPatterns: null
})
stalker.watch(next)
stalker.close()
```


<!-- HISTORY/ -->

<h2>History</h2>

<a href="https://github.com/bevry/watchr/blob/master/HISTORY.md#files">Discover the release history by heading on over to the <code>HISTORY.md</code> file.</a>

<!-- /HISTORY -->


<!-- CONTRIBUTE/ -->

<h2>Contribute</h2>

<a href="https://github.com/bevry/watchr/blob/master/CONTRIBUTING.md#files">Discover how you can contribute by heading on over to the <code>CONTRIBUTING.md</code> file.</a>

<!-- /CONTRIBUTE -->


<!-- BACKERS/ -->

<h2>Backers</h2>

<h3>Maintainers</h3>

These amazing people are maintaining this project:

<ul><li><a href="http://balupton.com">Benjamin Lupton</a> — <a href="https://github.com/bevry/watchr/commits?author=balupton" title="View the GitHub contributions of Benjamin Lupton on repository bevry/watchr">view contributions</a></li></ul>

<h3>Sponsors</h3>

No sponsors yet! Will you be the first?

<span class="badge-patreon"><a href="http://patreon.com/bevry" title="Donate to this project using Patreon"><img src="https://img.shields.io/badge/patreon-donate-yellow.svg" alt="Patreon donate button" /></a></span>
<span class="badge-gratipay"><a href="https://www.gratipay.com/bevry" title="Donate weekly to this project using Gratipay"><img src="https://img.shields.io/badge/gratipay-donate-yellow.svg" alt="Gratipay donate button" /></a></span>
<span class="badge-flattr"><a href="https://flattr.com/profile/balupton" title="Donate to this project using Flattr"><img src="https://img.shields.io/badge/flattr-donate-yellow.svg" alt="Flattr donate button" /></a></span>
<span class="badge-paypal"><a href="https://bevry.me/paypal" title="Donate to this project using Paypal"><img src="https://img.shields.io/badge/paypal-donate-yellow.svg" alt="PayPal donate button" /></a></span>
<span class="badge-bitcoin"><a href="https://bevry.me/bitcoin" title="Donate once-off to this project using Bitcoin"><img src="https://img.shields.io/badge/bitcoin-donate-yellow.svg" alt="Bitcoin donate button" /></a></span>
<span class="badge-wishlist"><a href="https://bevry.me/wishlist" title="Buy an item on our wishlist for us"><img src="https://img.shields.io/badge/wishlist-donate-yellow.svg" alt="Wishlist browse button" /></a></span>

<h3>Contributors</h3>

These amazing people have contributed code to this project:

<ul><li><a href="http://balupton.com">Benjamin Lupton</a> — <a href="https://github.com/bevry/watchr/commits?author=balupton" title="View the GitHub contributions of Benjamin Lupton on repository bevry/watchr">view contributions</a></li>
<li><a href="http://www.gitbook.com">Aaron O'Mullan</a> — <a href="https://github.com/bevry/watchr/commits?author=AaronO" title="View the GitHub contributions of Aaron O'Mullan on repository bevry/watchr">view contributions</a></li>
<li><a href="monkeyandcrow.com">Adam Sanderson</a> — <a href="https://github.com/bevry/watchr/commits?author=adamsanderson" title="View the GitHub contributions of Adam Sanderson on repository bevry/watchr">view contributions</a></li>
<li><a href="http://ca.sey.me">Casey Foster</a> — <a href="https://github.com/bevry/watchr/commits?author=caseywebdev" title="View the GitHub contributions of Casey Foster on repository bevry/watchr">view contributions</a></li>
<li><a href="https://github.com/FredrikNoren">Fredrik Norén</a> — <a href="https://github.com/bevry/watchr/commits?author=FredrikNoren" title="View the GitHub contributions of Fredrik Norén on repository bevry/watchr">view contributions</a></li>
<li><a href="https://github.com/robsonpeixoto">Robson Roberto Souza Peixoto</a> — <a href="https://github.com/bevry/watchr/commits?author=robsonpeixoto" title="View the GitHub contributions of Robson Roberto Souza Peixoto on repository bevry/watchr">view contributions</a></li>
<li><a href="http://stuartk.com/">Stuart Knightley</a> — <a href="https://github.com/bevry/watchr/commits?author=Stuk" title="View the GitHub contributions of Stuart Knightley on repository bevry/watchr">view contributions</a></li>
<li><a href="http://digitalocean.com">David Byrd</a> — <a href="https://github.com/bevry/watchr/commits?author=thebyrd" title="View the GitHub contributions of David Byrd on repository bevry/watchr">view contributions</a></li>
<li><a href="https://github.com/jlevine22">Josh Levine</a> — <a href="https://github.com/bevry/watchr/commits?author=jlevine22" title="View the GitHub contributions of Josh Levine on repository bevry/watchr">view contributions</a></li></ul>

<a href="https://github.com/bevry/watchr/blob/master/CONTRIBUTING.md#files">Discover how you can contribute by heading on over to the <code>CONTRIBUTING.md</code> file.</a>

<!-- /BACKERS -->


<!-- LICENSE/ -->

<h2>License</h2>

Unless stated otherwise all works are:

<ul><li>Copyright &copy; 2012+ <a href="http://bevry.me">Bevry Pty Ltd</a></li>
<li>Copyright &copy; 2011 <a href="http://balupton.com">Benjamin Lupton</a></li></ul>

and licensed under:

<ul><li><a href="http://spdx.org/licenses/MIT.html">MIT License</a></li></ul>

<!-- /LICENSE -->
