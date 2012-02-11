test:
	./node_modules/.bin/mocha \
		--reporter spec \
		--ui bdd \
		--ignore-leaks \
		--growl

test-debug:
	node --debug-brk ./node_modules/.bin/mocha \
		--reporter spec \
		--ui bdd \
		--ignore-leaks \
		--growl

docs:
	./node_modules/.bin/docco lib/*.coffee

.PHONY: test