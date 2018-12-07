'use strict'

/** @type {typeof import("./source/test.js") } */
module.exports = require('editions').requirePackage(__dirname, require, 'test.js')
