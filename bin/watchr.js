require('coffee-script')
watcher = require("" + __dirname + "/../lib/watchr.coffee");
watcher.watch(process.cwd(), function() {
  return console.log('giggity');
});