#!/usr/bin/env node

var compactor = require('./Compactor');
var parseArgs = require('minimist');


function forEach(arr, callback) {
    if (arr != null) {
        if (arr instanceof Array) {
            arr.forEach(callback);
        } else {
            callback(arr, 0);
        }
    }
}

var args = parseArgs(process.argv.slice(2), {
    boolean: ['no-cache', 'cache', 'z', 'debug-args', 'debug-opts', 'dry-run'],
    string: ['e', 'entry-module', 'o', 'output-file', 'x'],
    alias: {
        'export': 'x',
        'no-cache': 'z',
        'output-file': 'o',
        'entry-module': 'e'
    }
});

var opts = {};

opts.outFile = args['output-file'] || 'bundle.js';
opts.entryModule = args['entry-module'];

if (!opts.entryModule) {
    console.error('Must specify at least one entry module with -e or --entry-module');
    process.exit(1);
}

forEach(opts.entryModule, function(entryModule) {
    if (entryModule === true) {
        console.log()
    }
});

if (args.cache === false || args['no-cache']) {
    opts.noCache = true;
}

forEach(args.export, function(exp) {
    if (!/^[\w\.\/\-]+=\w+$/.test(exp)) {
        console.error('Invalid export module param \'' + exp + '\'');
        process.exit(1);
    }
    var parts = exp.split('=');
    var exports = opts.exports || (opts.exports = {});
    exports[parts[0]] = parts[1];
});

if (args['debug-args']) {
    console.log('Parsed Args: ', args);
}
if (args['debug-opts']) {
    console.log('Compactor Opts: ', opts);
}

if (!args['dry-run']) {
    compactor(opts);
}
