dev:
	./node_modules/.bin/coffee -w -o lib/ -c src/

docs:
	./node_modules/.bin/docco src/*.coffee

test:
	make clean
	node ./node_modules/mocha/bin/mocha

clean:
	rm -Rf node_modules/ npm-debug.log
	npm install

.PHONY: dev docs test clean