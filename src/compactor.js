var path = require('path');
var fs = require('fs-extra');
var deepEqual = require('deep-equal');
var dependencySort = require('./DependencySort');
var resolve = require('resolve');
var babelCore = require('babel-core');

function compactor(entryModule, outFile, opts) {
    if (arguments.length === 1) {
        opts = entryModule || {};
    } else {
        opts = opts || {};
        opts.entryModule = entryModule;
        opts.outFile = outFile;
    }
    var cwd = process.cwd();
    opts.cacheDir = path.resolve(opts.cacheDir || cwd, '.compactor_cache');
    if (opts.noCache && fs.existsSync(opts.cacheDir)) {
        fs.removeSync(opts.cacheDir);
    }
    var metadata = readMetadata(opts.cacheDir);
    opts.exports = getExportsWithResolvedPaths(opts.exports);
    opts.outFile =  path.resolve(cwd, opts.outFile);
    opts.entryModule = resolve.sync(opts.entryModule, { basedir: cwd });
    var changeRef = { changed: false };
    setMetadataPropDeep(metadata, changeRef, 'opts', opts);
    compactorImpl(metadata, changeRef.changed);
}

function compactorImpl(metadata, opt_metadataChanged) {
    var allModules = {};
    var opts = metadata.opts;
    var plugins = require('./plugins')(opts);
    var changed = processModulesHelper(metadata, allModules, {}, plugins, opts.entryModule);
    if (!fs.existsSync(opts.outFile) || changed || opt_metadataChanged) {
        writeBundle(allModules, metadata);
        if (!opts.noCache) {
            writeMetadata(opts.cacheDir, metadata);
        }
    }
    if (opts.noCache) {
        fs.removeSync(opts.cacheDir);
    }
}

function getOrderedFiles(allModules, metadata) {
    var arrayDeps = [];
    for (var key in metadata.files) {
        if (metadata.files.hasOwnProperty(key)) {
            if (allModules.hasOwnProperty(key)) {
                var deps = metadata.files[key].dependencies;
                for (var i = 0; i < deps.length; i++) {
                    arrayDeps.push([key, deps[i]]);
                }
            } else {
                delete metadata.files[key];
            }
        }
    }
    return dependencySort(arrayDeps);
}

function processModulesHelper(metadata, allModules, processed, plugins, file) {
    if (!processed[file]) {
        processed[file] = true;
        allModules[file] = true;
        var changed = false;
        if (path.extname(file) === '.js') {
            var modTime = getFileModTime(file),
                fileData = metadata.files[file] || (metadata.files[file] = {});
            if (isModTimeOld(modTime, fileData.lastModTime)) {
                plugins.init(file, metadata, fileData);
                var code = babelCore.transformFileSync(file, {
                    plugins: plugins,
                    // TODO: parameterize this in opts
                    optional: ["utility.inlineEnvironmentVariables"],
                    blacklist: ["strict"]
                }).code;
                plugins.cleanup();
                writeCacheFile(metadata.opts.cacheDir, file, ';' + code + ';\n');
                fileData.lastModTime = modTime;
                changed = true;
            }
            var deps = fileData.dependencies;
            for (var i = 0; i < deps.length; i++) {
                allModules[deps[i]] = true;
                if (processModulesHelper(metadata, allModules, processed, plugins, deps[i])) {
                    changed = true;
                }
            }
        }
        return changed;
    } else {
        return false;
    }
}

function getExportsWithResolvedPaths(exports) {
    var newExports = {};
    if (exports) {
        var cwd = process.cwd();
        for (var module in exports) {
            if (exports.hasOwnProperty(module)) {
                var resolved = resolve.sync(module, { basedir: cwd });
                newExports[resolved] = exports[module];
            }
        }
    }
    return newExports;
}

function setMetadataProp(metadata, changeFlagRef, prop, value) {
    if (metadata[prop] !== value) {
        changeFlagRef.changed = true;
        metadata[prop] = value;
    }
}

function setMetadataPropDeep(metadata, changeFlagRef, prop, value) {
    if (!deepEqual(metadata[prop], value, { strict: true })) {
        changeFlagRef.changed = true;
        metadata[prop] = value;
    }
}

function writeBundle(allModules, metadata) {
    var orderedFiles = getOrderedFiles(allModules, metadata);
    metadata.modTime = Date.now();
    var header = '(function() {\nvar ';
    var firstVar = true;
    for (var key in metadata.idents) {
        if (metadata.idents.hasOwnProperty(key)) {
            var ident = metadata.idents[key];
            if (!firstVar) {
                header += ',\n    ';
            } else {
                firstVar = false;
            }
            if (metadata.files[key].setsExportProperty) {
                header += ident + ' = {}';
            } else {
                header += ident;
            }
        }
    }
    header += ';\n';
    var outFile = metadata.opts.outFile;
    fs.writeFileSync(outFile, header);
    for (var i = 0; i < orderedFiles.length; i++) {
        var file = orderedFiles[i];
        fs.appendFileSync(outFile, fs.readFileSync(getCachePath(metadata.opts.cacheDir, file)));
    }
    fs.appendFileSync(outFile, '\n})();');
}

function getCachePath(cacheDir, absPath) {
    var relPath = path.relative(process.cwd(), absPath).replace(/\.\.\//g, '__/');
    return path.resolve(cacheDir, relPath);
}

function writeCacheFile(cacheDir, file, content) {
    var cachePath = getCachePath(cacheDir, file);
    fs.outputFileSync(cachePath, content);
}

function readMetadata(cacheDir) {
    var metadata;
    try {
        metadata = fs.readJsonSync(path.join(cacheDir, 'metadata.json')) || {};
    } catch (e) {
        metadata = {};
    }
    if (!metadata.files) {
        metadata.files = {};
    }
    if (!metadata.idents) {
        metadata.idents = {};
    }
    return metadata;
}

function writeMetadata(cacheDir, data) {
    fs.outputJsonSync(path.join(cacheDir, 'metadata.json'), JSON.stringify(data));
}

function getFileModTime(file) {
    try {
        return fs.statSync(file).mtime.getTime();
    } catch (e) {
        return null;
    }
}

function isModTimeOld(modTimeA, modTimeB) {
    return modTimeA != null && (modTimeB == null || modTimeA > modTimeB);
}

module.exports = compactor;