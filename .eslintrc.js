// 2016 September 7
// https://github.com/bevry/base
// http://eslint.org
// This code must be able to run on Node 0.10
/* eslint no-warning-comments: 0 */
var IGNORE = 0, WARN = 1, ERROR = 2, MAX_PARAMS = 4

var config = {
	extends: ['eslint:recommended'],
	plugins: [],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 6,
		ecmaFeatures: {
			jsx: true
		}
	},
	env: {
		browser: true,
		node: true,
		es6: true,
		commonjs: true,
		amd: true
	},
	rules: {
		// ----------------------------
		// Problems with these rules
		// If we can figure out how to enable the following, that would be great

		// Two spaces after one line if or else:
		// if ( blah )  return
		// Insead of one space:
		// if ( blah ) return

		// No spaces on embedded function:
		// .forEach(function(key, value){
		// instead of:
		// .forEach(function (key, value) {

		// Else and catch statements on the same line as closing brace:
		// } else {
		// } catch (e) {
		// instead of:
		// }
		// else {


		// --------------------------------------
		// Possible Errors
		// The following rules point out areas where you might have made mistakes.

		// ES6 supports dangling commas
		'comma-dangle': IGNORE,

		// Don't allow assignments in conditional statements (if, while, etc.)
		'no-cond-assign': [ERROR, 'always'],

		// Warn but don't error about console statements
		'no-console': WARN,

		// Allow while(true) loops
		'no-constant-condition': IGNORE,

		// Seems like a good idea to error about this
		'no-control-regex': ERROR,

		// Warn but don't error about console statements
		'no-debugger': WARN,

		// Don't allow duplicate arguments in a function, they can cause errors
		'no-dupe-args': ERROR,

		// Disallow duplicate keys in an object, they can cause errors
		'no-dupe-keys': ERROR,

		// Disallow duplicate case statements in a switch
		'no-duplicate-case': ERROR,

		// Allow empty block statements, they are useful for clarity
		'no-empty': IGNORE,

		// Disallow empty [] in regular expressions as they cause unexpected behaviour
		'no-empty-character-class': ERROR,

		// Overwriting the exception argument in a catch statement can cause memory leaks in some browsers
		'no-ex-assign': ERROR,

		// Disallow superflous boolean casts, they offer no value
		'no-extra-boolean-cast': ERROR,

		// Allow superflous parenthesis as they offer clarity in some cases
		'no-extra-parens': IGNORE,

		// Disallow superflous semicolons, they offer no value
		'no-extra-semi': IGNORE,

		// Seems like a good idea to error about this
		'no-func-assign': ERROR,

		// Seems like a good idea to error about this
		'no-inner-declarations': ERROR,

		// Seems like a good idea to error about this
		'no-invalid-regexp': ERROR,

		// Seems like a good idea to error about this
		'no-irregular-whitespace': ERROR,

		// Seems like a good idea to error about this
		'no-negated-in-lhs': ERROR,

		// Seems like a good idea to error about this
		'no-obj-calls': ERROR,

		// Seems like a good idea to error about this
		// Instead of /  /  used / {ERROR}/ instead
		'no-regex-spaces': ERROR,

		// Seems like a good idea to error about this
		'no-sparse-arrays': ERROR,

		// Seems like a good idea to error about this
		'no-unexpected-multiline': ERROR,

		// Seems like a good idea to error about this
		'no-unreachable': ERROR,

		// Seems like a good idea to error about this
		'use-isnan': ERROR,

		// We use JSDoc again
		'valid-jsdoc': [ERROR, {
			"requireParamDescription": false,
			"requireReturnDescription": false
		}],

		// Seems like a good idea to error about this
		'valid-typeof': ERROR,


		// --------------------------------------
		// Best Practices
		// These are rules designed to prevent you from making mistakes. They either prescribe a better way of doing something or help you avoid footguns.

		// Meh
		// Enforces getter/setter pairs in objects
		'accessor-pairs': IGNORE,

		// Seems sensible
		// Enforces return statements in callbacks of array's methods
		'array-callback-return': ERROR,

		// This rule seems buggy
		'block-scoped-var': IGNORE,

		// Disable complexity checks, they are annoying and not that useful in detecting actual complexity
		'complexity': IGNORE,

		// We use blank returns for break statements
		'consistent-return': IGNORE,

		// Always require curly braces unless the statement is all on a single line
		'curly': [ERROR, 'multi-line'],

		// If we don't have a default cause, it probably means we should throw an error
		'default-case': ERROR,

		// Dots should be on the newlines
		// chainableThingy
		//   .doSomething()
		//   .doSomethingElse()
		'dot-location': [ERROR, 'property'],

		// Use dot notation where possible
		'dot-notation': ERROR,

		// Unless you are doing == null, then force === to avoid truthy/falsey mistakes
		'eqeqeq': [ERROR, 'allow-null'],

		// Always use hasOwnProperty when doing for in
		'guard-for-in': ERROR,

		// Warn about alert statements in our code
		// Use one of the suggested alternatives instead
		// Reasoning is they could be mistaken for left over debugging statements
		'no-alert': WARN,

		// They are very slow
		'no-caller': ERROR,

		// Wow...
		'no-case-declarations': ERROR,

		// Seems like a good idea to error about this
		'no-div-regex': ERROR,

		// Returns in else statements offer code clarity, so disable this rule
		'no-else-return': IGNORE,

		// Up to developer sensibility
		// disallow use of empty functions
		'no-empty-function': IGNORE,

		// Seems sensible
		'no-labels': ERROR,

		// Seems sensible
		'no-empty-pattern': ERROR,

		// We know that == null is a null and undefined check
		'no-eq-null': IGNORE,

		// Eval is slow and unsafe, use vm's instead
		'no-eval': ERROR,

		// There is never a good reason for this
		'no-extend-native': ERROR,

		// Don't allow useless binds
		'no-extra-bind': ERROR,

		// Seems sensible
		'no-extra-label': ERROR,

		// Don't allow switch case statements to follow through, use continue keyword instead
		'no-fallthrough': ERROR,

		// Use zero when doing decimals, otherwise it is confusing
		'no-floating-decimal': ERROR,

		// Cleverness is unclear
		'no-implicit-coercion': ERROR,

		// Seems sensible providing detection works correctly
		'no-implicit-globals': ERROR,

		// A sneaky way to do evals
		'no-implied-eval': ERROR,

		// This throws for a lot of senseless things, like chainy functions
		'no-invalid-this': IGNORE,

		// Use proper iterators instead
		'no-iterator': ERROR,

		// We never use this, it seems silly to allow this
		'no-labels': ERROR,

		// We never use this, it seems silly to allow this
		'no-lone-blocks': ERROR,

		// Loop functions always cause problems, as the scope isn't clear through iterations
		'no-loop-func': ERROR,

		// Far too annoying
		'no-magic-numbers': IGNORE,

		// We like multi spaces for clarity
		// E.g. We like
		// if ( blah )  return foo
		// Instead of:
		// if ( blah ) return foo
		// @TODO would be great to enforce the above
		'no-multi-spaces': IGNORE,

		// Use ES6 template strings instead
		'no-multi-str': ERROR,

		// Would be silly to allow this
		'no-native-reassign': ERROR,

		// We never use this, it seems silly to allow this
		'no-new-func': ERROR,

		// We never use this, it seems silly to allow this
		'no-new-wrappers': ERROR,

		// We never use this, it seems silly to allow this
		'no-new': ERROR,

		// We never use this, it seems silly to allow this
		'no-octal-escape': ERROR,

		// We never use this, it seems silly to allow this
		'no-octal': ERROR,

		// We got to be pretty silly if we don't realise we are doing this
		// As such, take any usage as intentional and aware
		'no-param-reassign': IGNORE,

		// We use process.env wisely
		'no-process-env': IGNORE,

		// We never use this, it seems silly to allow this
		'no-proto': ERROR,

		// We never use this, it seems silly to allow this
		'no-redeclare': ERROR,

		// We never use this, it seems silly to allow this
		'no-return-assign': ERROR,

		// We never use this, it seems silly to allow this
		'no-script-url': ERROR,

		// Seems sensible
		'no-self-assign': ERROR,

		// We never use this, it seems silly to allow this
		'no-self-compare': ERROR,

		// We never use this, it seems silly to allow this
		'no-sequences': ERROR,

		// We always want proper error objects as they have stack traces and respond to instanceof Error checks
		'no-throw-literal': ERROR,

		// Could be a getter, so warn
		'no-unmodified-loop-condition': WARN,

		// We never use this, it seems silly to allow this
		'no-unused-expressions': ERROR,

		// Seems sensible
		'no-unused-labels': ERROR,

		// Seems sensible
		'no-useless-call': ERROR,

		// Seems sensible
		'no-useless-concat': ERROR,

		// We never use this, it seems silly to allow this
		'no-void': ERROR,

		// Warn about todos
		'no-warning-comments': [WARN, { terms: ['todo', 'fixme'], location: 'anywhere' }],

		// We never use this, it seems silly to allow this
		'no-with': ERROR,

		// Always specify a radix to avoid errors
		'radix': ERROR,

		// We appreciate the clarity late defines offer
		'vars-on-top': IGNORE,

		// Wrap instant called functions in parenthesis for clearer intent
		'wrap-iife': ERROR,

		// Because we force === and never allow assignments in conditions
		// we have no need for yoda statements, so disable them
		'yoda': [ERROR, 'never'],


		// --------------------------------------
		// Strict Mode
		// These rules relate to using strict mode.

		// Ensure that use strict is specified to prevent the runtime erorr:
		// SyntaxError: Block-scoped declarations (let, const, function, class) not yet supported outside strict mode
		'strict': [ERROR, 'global'],


		// --------------------------------------
		// Variables
		// These rules have to do with variable declarations.

		// We don't care
		'init-declaration': IGNORE,

		// Don't allow the catch method to shadow objects as browsers handle this differently
		// Update: We don't care for IE8
		'no-catch-shadow': IGNORE,

		// Don't use delete, it disables optimisations
		'no-delete-var': ERROR,

		// We never use this, it seems silly to allow this
		'no-label-var': ERROR,

		// We never use this, it seems silly to allow this
		'no-shadow-restricted-names': ERROR,

		// We use shadowing
		'no-shadow': IGNORE,

		// Makes sense
		'no-undef-init': ERROR,

		// Error when an undefined variable is used
		'no-undef': ERROR,

		// typeof blah === 'undefined' should always be used
		'no-undefined': ERROR,

		// Warn us when we don't use something
		'no-unused-vars': WARN,

		// Error when we try and use something before it is defined
		'no-use-before-define': ERROR,


		// --------------------------------------
		// Node.js and CommonJS
		// These rules are specific to JavaScript running on Node.js or using CommonJS in the browser.

		// Seems to difficult to enforce
		'callback-return': IGNORE,

		// We use require where it is appropriate to use it
		'global-require': IGNORE,

		// Force handling of callback errors
		'handle-callback-err': ERROR,

		// @TODO decide if this is good or not
		'no-mixed-requires': ERROR,

		// Disallow error prone syntax
		'no-new-require': ERROR,

		// Always use path.join for windows support
		'no-path-concat': ERROR,

		// We know what we are doing
		'no-process-exit': IGNORE,

		// No need to disallow any imports
		'no-restricted-imports': IGNORE,

		// No need to disallow any modules
		'no-restricted-modules': IGNORE,

		// Sometimes sync methods are useful, so warn but don't error
		'no-sync': WARN,


		// --------------------------------------
		// Stylistic
		// These rules are purely matters of style and are quite subjective.

		// We don't use spaces with brackets
		'array-bracket-spacing': [ERROR, 'never'],

		// Disallow or enforce spaces inside of single line blocks
		'block-spacing': [ERROR, 'always'],

		// Opening brace on same line, closing brace on its own line, except when statement is a single line
		'brace-style': [ERROR, 'stroustrup', { allowSingleLine: true }],

		// Use camel case
		'camelcase': ERROR,

		// Require a comma after always
		'comma-spacing': [ERROR, { before: false, after: true }],

		// Commas go last, we have tooling to detect if we forget a comma
		'comma-style': [ERROR, 'last'],

		// Require or disallow padding inside computed properties
		'computed-property-spacing': [ERROR, 'never'],

		// Enabling this was incredibly annoying when doing layers of nesting
		'consistent-this': IGNORE,

		// Enable to make UNIX people's lives easier
		'eol-last': ERROR,

		// We like anonymous functions
		'func-names': IGNORE,

		// Prefer to define functions via variables
		'func-style': [WARN, 'declaration'],

		// Nothing we want to blacklist
		// blacklist certain identifiers to prevent them being used
		'id-blacklist': IGNORE,

		// Sometimes short names are appropriate
		'id-length': IGNORE,

		// Camel case handles this for us
		'id-match': IGNORE,

		// Use tabs and indent case blocks
		// 'indent': [ERROR, 'tab', { SwitchCase: WARN }],
		// ^ broken

		// Prefer double qoutes for JSX properties: <a b="c" />, <a b='"' />
		'jsx-quotes': [ERROR, 'prefer-double'],

		// Space after the colon
		'key-spacing': [ERROR, {
			beforeColon: false,
			afterColon: true
		}],

		// Always force a space before and after a keyword
		'keyword-spacing': [ERROR],

		// Enforce unix line breaks
		'linebreak-style': [ERROR, 'unix'],

		// Enforce new lines before block comments
		'lines-around-comment': [ERROR, { beforeBlockComment: true, allowBlockStart: true }],

		// Disabled to ensure consistency with complexity option
		'max-depth': IGNORE,

		// We use soft wrap
		'max-len': IGNORE,

		// We are smart enough to know if this is bad or not
		'max-nested-callbacks': IGNORE,

		// Sometimes we have no control over this for compat reasons, so just warn
		'max-params': [WARN, MAX_PARAMS],

		// We should be able to use whatever feels right
		'max-statements': IGNORE,

		// Constructors should be CamelCase
		'new-cap': ERROR,

		// Always use parens when instantiating a class
		'new-parens': ERROR,

		// Too difficult to enforce correctly as too many edge-cases
		// require or disallow an empty newline after variable declarations
		'newline-after-var': IGNORE,

		// Let the author decide
		// enforce newline after each call when chaining the calls
		'newline-per-chained-call': IGNORE,

		// Don't use the array constructor when it is not needed
		'no-array-constructor': ERROR,

		// We never use bitwise, they are too clever
		'no-bitwise': ERROR,

		// We use continue
		'no-continue': IGNORE,

		// We like inline comments
		'no-inline-comments': IGNORE,

		// The code could be optimised if this error occurs
		'no-lonely-if': ERROR,

		// Don't mix spaces and tabs
		// @TODO maybe [ERROR, 'smart-tabs'] will be better, we will see
		'no-mixed-spaces-and-tabs': ERROR,

		// We use multiple empty lines for styling
		'no-multiple-empty-lines': IGNORE,

		// Sometimes it is more understandable with a negated condition
		'no-negated-condition': IGNORE,

		// Sometimes these are useful
		'no-nested-ternary': IGNORE,

		// Use {} instead of new Object()
		'no-new-object': ERROR,

		// We use plus plus
		'no-plusplus': IGNORE,

		// Handled by other rules
		'no-restricted-syntax': IGNORE,

		// We never use this, it seems silly to allow this
		'no-spaced-func': ERROR,

		// Sometimes ternaries are useful
		'no-ternary': IGNORE,

		// Disallow trailing spaces
		'no-trailing-spaces': ERROR,

		// Sometimes this is useful when avoiding shadowing
		'no-underscore-dangle': IGNORE,

		// Sensible
		'no-unneeded-ternary': ERROR,

		// Seems sensible
		'no-whitespace-before-property': ERROR,

		// Desirable, but too many edge cases it turns out where it is actually preferred
		'object-curly-spacing': IGNORE,

		// We like multiple var statements
		'one-var': IGNORE,
		'one-var-declaration-per-line': IGNORE,

		// Force use of shorthands when available
		'operator-assignment': [ERROR, 'always'],

		// Should be before, but not with =, *=, /=, += lines
		// @TODO figure out how to enforce
		'operator-linebreak': IGNORE,

		// This rule doesn't appear to work correclty
		'padded-blocks': IGNORE,

		// Seems like a good idea to error about this
		// 'quote-props': [ERROR, 'consistent-as-needed'],
		// ^ broken

		// Use single quotes where escaping isn't needed
		'quotes': [ERROR, 'single', 'avoid-escape'],

		// We use YUIdoc
		'require-jsdoc': IGNORE,

		// If semi's are used, then add spacing after
		'semi-spacing': [ERROR, { before: false, after: true }],

		// Up to dev
		'sort-imports': IGNORE,

		// Never use semicolons
		'semi': [ERROR, 'never'],

		// We don't care if our vars are alphabetical
		'sort-vars': IGNORE,

		// Always force a space before a {
		'space-before-blocks': [ERROR, 'always'],

		// function () {, get blah () {
		'space-before-function-paren': [ERROR, 'always'],

		// This is for spacing between [], so [ WARN, ERROR, 3 ] which we don't want
		'space-in-brackets': IGNORE,

		// This is for spacing between (), so doSomething( WARN, ERROR, 3 ) or if ( WARN === 3 )
		// which we want for ifs, but don't want for calls
		'space-in-parens': IGNORE,

		// We use this
		'space-infix-ops': ERROR,

		// We use this
		'space-unary-ops': ERROR,

		// We use this
		// 'spaced-line-comment': ERROR,
		'spaced-comment': ERROR,

		// We use this
		// @TODO revise this
		'wrap-regex': ERROR,


		// --------------------------------------
		// ECMAScript 6

		// Sensible to create more informed and clear code
		'arrow-body-style': [ERROR, 'as-needed'],

		// We do this, no reason why, just what we do
		'arrow-parens': [ERROR, 'always'],

		// Require consistent spacing for arrow functions
		'arrow-spacing': ERROR,

		// Makes sense as otherwise runtime error will occur
		'constructor-super': ERROR,

		// Seems the most consistent location for it
		'generator-star-spacing': [ERROR, 'before'],

		// Seems sensible
		'no-confusing-arrow': ERROR,

		// Sometimes useful for debugging
		'no-constant-condition': WARN,

		// Seems sensible
		'no-class-assign': ERROR,

		// Our developers should know the difference
		// disallow arrow functions where they could be confused with comparisons
		'no-confusing-arrow': IGNORE,

		// Makes sense as otherwise runtime error will occur
		'no-const-assign': ERROR,

		// Makes sense as otherwise runtime error will occur
		'no-dupe-class-members': ERROR,

		// Seems sensible
		'no-new-symbol': ERROR,

		// Makes sense as otherwise runtime error will occur
		'no-this-before-super': ERROR,

		// Seems sensible
		'no-useless-constructor': ERROR,

		// @TODO This probably should be an error
		// however it is useful for: for ( var key in obj ) {
		// which hopefully is more performant than let (@TODO check if it actually is more performant)
		'no-var': WARN,

		// Enforce ES6 object shorthand
		'object-shorthand': ERROR,

		// Better performance when running native
		// but horrible performance if not running native as could fallback to bind
		// https://travis-ci.org/bevry/es6-benchmarks
		'prefer-arrow-callback': IGNORE,

		// Sure, why not
		'prefer-const': WARN,

		// Controversial change, but makes sense to move towards to reduce the risk of bad people overwriting apply and call
		// https://github.com/eslint/eslint/issues/ERROR939
		// Ignoring because node does not yet support it, so we don't want to get the performance hit of using the compiled ES5 version
		'prefer-reflect': IGNORE,

		// Makes sense to enforce, exceptions should be opted out of on case by case
		'prefer-rest-params': ERROR,

		// Sure, why not
		'prefer-spread': ERROR,

		// Too annoying to enforce
		'prefer-template': IGNORE,

		// Makes sense
		'require-yield': ERROR,

		// Makes sense
		'template-curly-spacing': [ERROR, 'never'],

		// Our preference
		'yield-star-spacing': [ERROR, 'both'],


		// --------------------------------------
		// Plugins

		// Not sure why, but okay
	    'babel/no-await-in-loop': WARN,
    	'flow-vars/define-flow-type': WARN,
    	'flow-vars/use-flow-type': WARN
	}
}

// ------------------------------------
// Enhancements

// Load package.json file if it exists
var rules = Object.keys(config.rules)
var package = {}, devDeps = []
try {
	package = require('./package.json') || {}
	devDeps = Object.keys(package.devDependencies || {})
}
catch ( err ) {}

// Add babel parsing if installed
if ( devDeps.indexOf('babel-eslint') !== -1 ) {
	config.parser = 'babel-eslint'
}

// Add react linting if installed
if ( devDeps.indexOf('eslint-plugin-react') !== -1 ) {
	config.extends.push('plugin:react/recommended')
	config.plugins.push('react')
}

if ( devDeps.indexOf('eslint-plugin-babel') !== -1 ) {
	// Remove rules that babel rules replace
	config.plugins.push('babel')
	var replacements = [
		'array-bracket-spacing',
		'new-cap',
		'object-curly-spacing',
		'arrow-parens',
		'generator-star-spacing',
		'object-shorthand'
	]
	replacements.forEach(function (key) {
		if ( rules.indexOf(key) !== -1 ) {
			config.rules['babel/' + key] = config.rules[key]
			config.rules[key] = IGNORE
		}
	})
}
else {
	// Remove babel rules if not using babel
	rules.forEach(function (key) {
		if ( key.indexOf('babel/') === 0 ) {
			delete config.rules[key]
		}
	})
}

if ( devDeps.indexOf('eslint-plugin-flow-vars') !== -1 ) {
	// Add flow plugin if installed
	config.plugins.push('flow-vars')
}
else {
	// Remove flow rules if plugin not installed
	rules.forEach(function (key) {
		if ( key.indexOf('flow-vars/') === 0 ) {
			delete config.rules[key]
		}
	})
}


// ------------------------------------
// Export

module.exports = config
