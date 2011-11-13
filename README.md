## Watchr. Node.js file watching that doesn't suck.

Watchr is simple, you call `require('watchr').watch(path,function(){console.log('something changed inside the directory')})`

To install `npm install watchr`

It works with node.js 0.4, 0.5 and 0.6. It will use `fs.watchFile` if available, otherwise it will use `fs.watch` (e.g. windows support).

The `fs.watch` functionality is currently quite buggy - node.js returns segmentation faults here and there, but that is due to bugs in node.js. Sigh. Anyway, Enjoy.


## License

Licensed under the [MIT License](http://creativecommons.org/licenses/MIT/)
Copyright 2011 [Benjamin Arthur Lupton](http://balupton.com)