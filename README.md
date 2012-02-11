## Watchr. Node.js file watching that doesn't suck.

Watchr normalises the node.js watching functionality between 0.4's `fs.watchFile`, and 0.6's `fs.watch`, and adds support for watching entire directories including their far descendants (some call this recursive directory watching)


### Using

- JavaScript

	``` javascript
	// Requires
	require('coffee-script'); # watchr dependency
	var watchr = require('watchr');

	// Watch
	watchr.watch(path,function(){
		console.log('something changed inside the directory');
	});
	```

- CoffeeScript

	``` coffeescript
	# Requires
	watchr = require('watchr')

	# Watch
	watchr.watch path, ->
		console.log('something changed inside the directory')
	```


## Install

``` bash
npm install watchr
```


## Support

Support can be found in the [github issue tracker](https://github.com/balupton/watchr/issues)


## History

You can discover the history inside the [History.md](https://github.com/balupton/watchr/blob/master/History.md#files) file


## License

Licensed under the [MIT License](http://creativecommons.org/licenses/MIT/)
<br/>Copyright &copy; 2011-2012 [Benjamin Arthur Lupton](http://balupton.com)
