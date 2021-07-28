<!-- TITLE/ -->

<h1>watchr</h1>

<!-- /TITLE -->


<!-- BADGES/ -->

<span class="badge-githubworkflow"><a href="https://github.com/bevry/watchr/actions?query=workflow%3Abevry" title="View the status of this project's GitHub Workflow: bevry"><img src="https://github.com/bevry/watchr/workflows/bevry/badge.svg" alt="Status of the GitHub Workflow: bevry" /></a></span>
<span class="badge-npmversion"><a href="https://npmjs.org/package/watchr" title="View this project on NPM"><img src="https://img.shields.io/npm/v/watchr.svg" alt="NPM version" /></a></span>
<span class="badge-npmdownloads"><a href="https://npmjs.org/package/watchr" title="View this project on NPM"><img src="https://img.shields.io/npm/dm/watchr.svg" alt="NPM downloads" /></a></span>
<span class="badge-daviddm"><a href="https://david-dm.org/bevry/watchr" title="View the status of this project's dependencies on DavidDM"><img src="https://img.shields.io/david/bevry/watchr.svg" alt="Dependency Status" /></a></span>
<span class="badge-daviddmdev"><a href="https://david-dm.org/bevry/watchr#info=devDependencies" title="View the status of this project's development dependencies on DavidDM"><img src="https://img.shields.io/david/dev/bevry/watchr.svg" alt="Dev Dependency Status" /></a></span>
<br class="badge-separator" />
<span class="badge-githubsponsors"><a href="https://github.com/sponsors/balupton" title="Donate to this project using GitHub Sponsors"><img src="https://img.shields.io/badge/github-donate-yellow.svg" alt="GitHub Sponsors donate button" /></a></span>
<span class="badge-patreon"><a href="https://patreon.com/bevry" title="Donate to this project using Patreon"><img src="https://img.shields.io/badge/patreon-donate-yellow.svg" alt="Patreon donate button" /></a></span>
<span class="badge-flattr"><a href="https://flattr.com/profile/balupton" title="Donate to this project using Flattr"><img src="https://img.shields.io/badge/flattr-donate-yellow.svg" alt="Flattr donate button" /></a></span>
<span class="badge-liberapay"><a href="https://liberapay.com/bevry" title="Donate to this project using Liberapay"><img src="https://img.shields.io/badge/liberapay-donate-yellow.svg" alt="Liberapay donate button" /></a></span>
<span class="badge-buymeacoffee"><a href="https://buymeacoffee.com/balupton" title="Donate to this project using Buy Me A Coffee"><img src="https://img.shields.io/badge/buy%20me%20a%20coffee-donate-yellow.svg" alt="Buy Me A Coffee donate button" /></a></span>
<span class="badge-opencollective"><a href="https://opencollective.com/bevry" title="Donate to this project using Open Collective"><img src="https://img.shields.io/badge/open%20collective-donate-yellow.svg" alt="Open Collective donate button" /></a></span>
<span class="badge-crypto"><a href="https://bevry.me/crypto" title="Donate to this project using Cryptocurrency"><img src="https://img.shields.io/badge/crypto-donate-yellow.svg" alt="crypto donate button" /></a></span>
<span class="badge-paypal"><a href="https://bevry.me/paypal" title="Donate to this project using Paypal"><img src="https://img.shields.io/badge/paypal-donate-yellow.svg" alt="PayPal donate button" /></a></span>
<span class="badge-wishlist"><a href="https://bevry.me/wishlist" title="Buy an item on our wishlist for us"><img src="https://img.shields.io/badge/wishlist-donate-yellow.svg" alt="Wishlist browse button" /></a></span>

<!-- /BADGES -->


Watchr provides a normalised API the file watching APIs of different node versions, nested/recursive file and directory watching, and accurate detailed events for file/directory creations, updates, and deletions.

## Usage

[Complete API Documentation.](http://master.watchr.bevry.surge.sh/docs/index.html)

There are two concepts in watchr, they are:

-   Watcher - this wraps the native file system watching, makes it reliable, and supports deep watching
-   Stalker - this wraps the watcher, such that for any given path, there can be many stalkers, but only one watcher

The simplest usage is:

```javascript
// Import the watching library
var watchr = require('watchr')

// Define our watching parameters
var path = process.cwd()
function listener(changeType, fullPath, currentStat, previousStat) {
    switch (changeType) {
        case 'update':
            console.log(
                'the file',
                fullPath,
                'was updated',
                currentStat,
                previousStat
            )
            break
        case 'create':
            console.log('the file', fullPath, 'was created', currentStat)
            break
        case 'delete':
            console.log('the file', fullPath, 'was deleted', previousStat)
            break
    }
}
function next(err) {
    if (err) return console.log('watch failed on', path, 'with error', err)
    console.log('watch successful on', path)
}

// Watch the path with the change listener and completion callback
var stalker = watchr.open(path, listener, next)

// Close the stalker of the watcher
stalker.close()
```

More advanced usage is:

```javascript
// Create the stalker for the path
var stalker = watchr.create(path)

// Listen to the events for the stalker/watcher
stalker.on('change', listener)
stalker.on('log', console.log)
stalker.once('close', function (reason) {
    console.log('closed', path, 'because', reason)
    stalker.removeAllListeners() // as it is closed, no need for our change or log listeners any more
})

// Set the default configuration for the stalker/watcher
stalker.setConfig({
    stat: null,
    interval: 5007,
    persistent: true,
    catchupDelay: 2000,
    preferredMethods: ['watch', 'watchFile'],
    followLinks: true,
    ignorePaths: false,
    ignoreHiddenFiles: false,
    ignoreCommonPatterns: true,
    ignoreCustomPatterns: null,
})

// Start watching
stalker.watch(next)

// Stop watching
stalker.close()
```

<!-- INSTALL/ -->

<h2>Install</h2>

<a href="https://npmjs.com" title="npm is a package manager for javascript"><h3>npm</h3></a>
<ul>
<li>Install: <code>npm install --save watchr</code></li>
<li>Import: <code>import * as pkg from ('watchr')</code></li>
<li>Require: <code>const pkg = require('watchr')</code></li>
</ul>

<h3><a href="https://editions.bevry.me" title="Editions are the best way to produce and consume packages you care about.">Editions</a></h3>

<p>This package is published with the following editions:</p>

<ul><li><code>watchr</code> aliases <code>watchr/source/index.js</code></li>
<li><code>watchr/source/index.js</code> is <a href="https://en.wikipedia.org/wiki/ECMAScript#ES.Next" title="ECMAScript Next">ESNext</a> source code for <a href="https://nodejs.org" title="Node.js is a JavaScript runtime built on Chrome's V8 JavaScript engine">Node.js</a> 10 || 12 || 14 with <a href="https://nodejs.org/dist/latest-v5.x/docs/api/modules.html" title="Node/CJS Modules">Require</a> for modules</li></ul>

<h3><a href="https://www.typescriptlang.org/" title="TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. ">TypeScript</a></h3>

This project provides its type information via inline <a href="http://usejsdoc.org" title="JSDoc is an API documentation generator for JavaScript, similar to Javadoc or phpDocumentor">JSDoc Comments</a>. To make use of this in <a href="https://www.typescriptlang.org/" title="TypeScript is a typed superset of JavaScript that compiles to plain JavaScript. ">TypeScript</a>, set your <code>maxNodeModuleJsDepth</code> compiler option to `5` or thereabouts. You can accomlish this via your `tsconfig.json` file like so:

``` json
{
  "compilerOptions": {
    "maxNodeModuleJsDepth": 5
  }
}
```

<!-- /INSTALL -->


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

<ul><li><a href="https://balupton.com">Benjamin Lupton</a> — <a href="https://github.com/bevry/watchr/commits?author=balupton" title="View the GitHub contributions of Benjamin Lupton on repository bevry/watchr">view contributions</a></li></ul>

<h3>Sponsors</h3>

No sponsors yet! Will you be the first?

<span class="badge-githubsponsors"><a href="https://github.com/sponsors/balupton" title="Donate to this project using GitHub Sponsors"><img src="https://img.shields.io/badge/github-donate-yellow.svg" alt="GitHub Sponsors donate button" /></a></span>
<span class="badge-patreon"><a href="https://patreon.com/bevry" title="Donate to this project using Patreon"><img src="https://img.shields.io/badge/patreon-donate-yellow.svg" alt="Patreon donate button" /></a></span>
<span class="badge-flattr"><a href="https://flattr.com/profile/balupton" title="Donate to this project using Flattr"><img src="https://img.shields.io/badge/flattr-donate-yellow.svg" alt="Flattr donate button" /></a></span>
<span class="badge-liberapay"><a href="https://liberapay.com/bevry" title="Donate to this project using Liberapay"><img src="https://img.shields.io/badge/liberapay-donate-yellow.svg" alt="Liberapay donate button" /></a></span>
<span class="badge-buymeacoffee"><a href="https://buymeacoffee.com/balupton" title="Donate to this project using Buy Me A Coffee"><img src="https://img.shields.io/badge/buy%20me%20a%20coffee-donate-yellow.svg" alt="Buy Me A Coffee donate button" /></a></span>
<span class="badge-opencollective"><a href="https://opencollective.com/bevry" title="Donate to this project using Open Collective"><img src="https://img.shields.io/badge/open%20collective-donate-yellow.svg" alt="Open Collective donate button" /></a></span>
<span class="badge-crypto"><a href="https://bevry.me/crypto" title="Donate to this project using Cryptocurrency"><img src="https://img.shields.io/badge/crypto-donate-yellow.svg" alt="crypto donate button" /></a></span>
<span class="badge-paypal"><a href="https://bevry.me/paypal" title="Donate to this project using Paypal"><img src="https://img.shields.io/badge/paypal-donate-yellow.svg" alt="PayPal donate button" /></a></span>
<span class="badge-wishlist"><a href="https://bevry.me/wishlist" title="Buy an item on our wishlist for us"><img src="https://img.shields.io/badge/wishlist-donate-yellow.svg" alt="Wishlist browse button" /></a></span>

<h3>Contributors</h3>

These amazing people have contributed code to this project:

<ul><li><a href="https://github.com/AaronO">Aaron O'Mullan</a> — <a href="https://github.com/bevry/watchr/commits?author=AaronO" title="View the GitHub contributions of Aaron O'Mullan on repository bevry/watchr">view contributions</a></li>
<li><a href="https://github.com/adamsanderson">Adam Sanderson</a> — <a href="https://github.com/bevry/watchr/commits?author=adamsanderson" title="View the GitHub contributions of Adam Sanderson on repository bevry/watchr">view contributions</a></li>
<li><a href="https://balupton.com">Benjamin Lupton</a> — <a href="https://github.com/bevry/watchr/commits?author=balupton" title="View the GitHub contributions of Benjamin Lupton on repository bevry/watchr">view contributions</a></li>
<li><a href="https://github.com/caseywebdev">Casey Foster</a> — <a href="https://github.com/bevry/watchr/commits?author=caseywebdev" title="View the GitHub contributions of Casey Foster on repository bevry/watchr">view contributions</a></li>
<li><a href="http://digitalocean.com">David Byrd</a></li>
<li><a href="https://github.com/FredrikNoren">Fredrik Norén</a> — <a href="https://github.com/bevry/watchr/commits?author=FredrikNoren" title="View the GitHub contributions of Fredrik Norén on repository bevry/watchr">view contributions</a></li>
<li><a href="https://github.com/jlevine22">Josh Levine</a> — <a href="https://github.com/bevry/watchr/commits?author=jlevine22" title="View the GitHub contributions of Josh Levine on repository bevry/watchr">view contributions</a></li>
<li><a href="https://github.com/robsonpeixoto">Robson Roberto Souza Peixoto</a> — <a href="https://github.com/bevry/watchr/commits?author=robsonpeixoto" title="View the GitHub contributions of Robson Roberto Souza Peixoto on repository bevry/watchr">view contributions</a></li>
<li><a href="https://github.com/Stuk">Stuart Knightley</a> — <a href="https://github.com/bevry/watchr/commits?author=Stuk" title="View the GitHub contributions of Stuart Knightley on repository bevry/watchr">view contributions</a></li></ul>

<a href="https://github.com/bevry/watchr/blob/master/CONTRIBUTING.md#files">Discover how you can contribute by heading on over to the <code>CONTRIBUTING.md</code> file.</a>

<!-- /BACKERS -->


<!-- LICENSE/ -->

<h2>License</h2>

Unless stated otherwise all works are:

<ul><li>Copyright &copy; 2012+ <a href="http://bevry.me">Bevry Pty Ltd</a></li>
<li>Copyright &copy; 2011 <a href="https://balupton.com">Benjamin Lupton</a></li></ul>

and licensed under:

<ul><li><a href="http://spdx.org/licenses/MIT.html">MIT License</a></li></ul>

<!-- /LICENSE -->
