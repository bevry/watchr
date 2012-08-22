# If you change something here, be sure to change it in package.json's scripts as well

BIN=node_modules/.bin/
COFFEE=$(BIN)coffee

dev:
	$(COFFEE) -cbwo out src

compile:
	$(COFFEE) -cbo out src

clean:
	rm -Rf lib node_modules/ npm-debug.log
	npm install

test-prepare: compile

test: test-prepare
	npm test

.PHONY: test
