# Compactor // todo: pick a better name
This is work in progress... the code is very dirty, and definitely not complete.
Compactor is a browserify/babelify alternative. It supports ES6/7 and packs modules similar to browserify, but it does so by transforming the modules in a way that saves on both the code size and execution overhead of the commonjs require mechanism. It supports any circular dependencies that also work in node or browserify.

#Hell Yeah Baby
With initial tests, I can bundle and compress the React library with about a 15% savings after gzip compared to browserify when both are compiled with closure compiler. There's about a 5% savings when compiling with uglify.