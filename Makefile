# If you change something here, be sure to reflect the changes in:
# - the scripts section of the package.json file
# - the .travis.yml file

# -----------------
# Variables

BIN=node_modules/.bin
COFFEE=$(BIN)/coffee
OUT=out
SRC=src


# -----------------
# Documentation

# Usage: coffee [options] path/to/script.coffee -- [args]
# -b, --bare         compile without a top-level function wrapper
# -c, --compile      compile to JavaScript and save as .js files
# -o, --output       set the output directory for compiled JavaScript
# -w, --watch        watch scripts for changes and rerun commands


# -----------------
# Commands

# Watch and recompile our files
dev:
	$(COFFEE) -cbwo $(OUT) $(SRC)

# Compile our files
compile:
	$(COFFEE) -cbo $(OUT) $(SRC)

# Clean up
clean:
	rm -Rf $(OUT) node_modules *.log

# Install dependencies
install:
	npm install

# Reset
reset:
	make clean
	make install
	make compile

# Ensure everything is ready for our tests (used by things like travis)
test-prepare:
	make reset

# Run our tests
test:
	npm test

# Example
example-run:
	make compile
	./bin/watchr
example:
	make example-run -i


# Ensure the listed commands always re-run and are never cached
.PHONY: dev compile clean install reset test-prepare test example example-run