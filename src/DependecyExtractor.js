var babelCore = require('babel-core');
var Plugin = babelCore.Plugin;
var resolve = require('resolve');
var t = babelCore.types;
var path = require('path');
var fs = require('fs');
var mkdirp = require('mkdirp');
var dependencySort = require('./DependencySort');

var usedIdents;
var currentIdents;
var currentWorkingDir;
var setsExportProperty;
var dependencies;
var exportName;
var extentions = ['', '.js', '.json', '.node'];

function getIdent(scope, file) {
    var ident = currentIdents[file];
    if (!ident) {
        ident = path.relative(currentWorkingDir, file);
        var newIdent;
        while ((newIdent = ident.replace(/^\.\.\//, '_')) !== ident) { }
        ident = '__' + ident.replace(/[^a-z](\w)?/gi, function(match, ch) {
            return ch ? ch.toUpperCase() : '';
        });
        while (usedIdents[ident]) {
            var match = /^(.+)(\d+)$/;
            if (match) {
                return match[1] + (parseInt(match[2]) + 1);
            } else {
                ident = ident + 2;
            }
        }
        usedIdents[ident] = true;
        currentIdents[file] = ident;
    }
    return t.identifier(ident);
}

var logged = false;

var myPlugin = new Plugin('my-plugin', {
    visitor: {
        Program: function(node, parent, scope, conf) {
            if (exportName) {
                var fileName = conf.opts.filename;
                node.body.push(t.assignmentExpression('=',
                    t.memberExpression(t.identifier('window'), t.identifier(exportName)),
                    getIdent(scope, fileName)
                ));
            }
        },
        CallExpression: function(node, parent, scope, conf) {
            var args;
            if (node.callee.type === 'Identifier'
                && node.callee.name === 'require'
                && (args = node.arguments).length === 1
                && args[0].type === 'Literal') {
                var workingDir = path.dirname(conf.opts.filename);
                //console.log('workingDir: ' + workingDir);
                var moduleName = args[0].value;
                var filePath = resolve.sync(moduleName, { basedir: workingDir, extensions: extentions });
                dependencies.push(filePath);
                return getIdent(scope, filePath);
            }
        },
        ExpressionStatement: function(node, parent, scope, conf) {
            if (node.expression.type === 'Literal' && node.expression.value === 'use strict') {
                this.dangerouslyRemove();
            }
        },
        MemberExpression: function(node, parent, scope, conf) {
            if (node.object.type === 'Identifier'
                && node.object.name === 'module'
                && node.property.type === 'Identifier'
                && node.property.name === 'exports') {
                var fileName = conf.opts.filename;
                return getIdent(scope, fileName);
            }
        },
        Identifier: function(node, parent, scope, conf) {
            if (node.name === 'exports') {
                if (parent.type === 'AssignmentExpression' && parent.left === node && parent.operator === '=') {
                    setsExportProperty = true;
                }
                if (parent.type === 'MemberExpression' && parent.property === node) {
                    return;
                }
                var fileName = conf.opts.filename;
                return getIdent(scope, fileName);
            }
        }
    }
});

var assignedIdentifiers;
var simpleAssignmentDeclarations;

function getBindingScope(scope, name) {
    do {
        if (scope.bindings[name]) return scope;
    } while (scope = scope.parent);
    return null;
}

var myPlugin2 = new Plugin('simple-assignment-checker', { visitor: {
    VariableDeclarator: function(node, parent, scope, conf) {
        if (node.init && node.init.type === 'Identifier') {
            var name = node.id.name,
                list = simpleAssignmentDeclarations.hasOwnProperty(name) ? simpleAssignmentDeclarations[name] : (simpleAssignmentDeclarations[name] = []);
            list.push({
                scope: getBindingScope(scope, name),
                init: node.init.name
            });
        }
    },
    AssignmentExpression: function(node, parent, scope, conf) {
        if (node.left.type === 'Identifier') {
            var name = node.left.name,
                list = assignedIdentifiers.hasOwnProperty(name) ? assignedIdentifiers[name] : (assignedIdentifiers[name] = []);
            list.push(getBindingScope(scope, name));
        }
    }
}});



function isNonAssignedSimpleAssignedVar(name, scope) {
    var declarations, idents;
    if (simpleAssignmentDeclarations.hasOwnProperty(name)) {
        declarations = simpleAssignmentDeclarations[name];
        var mappedName = null;
        for (var i = 0; i < declarations.length; i++) {
            if (!declarations[i]) {
                console.log(name, i, declarations);
            }
            if (declarations[i].scope === scope) {
                mappedName = declarations[i].init;
                break;
            }
        }
        if (!mappedName) {
            return false;
        }
        if (assignedIdentifiers.hasOwnProperty(name)) {
            idents = assignedIdentifiers[name];
            return idents.indexOf(scope) === -1 && mappedName;
        } else {
            return mappedName;
        }
    }
    return false;
}

var myPlugin3 = new Plugin('ident-replacer', { visitor: {
    Identifier: function(node, parent, scope, conf) {
        var name = node.name, initName;
        if ((parent.type !== 'VariableDeclarator' || parent.init === node)
            && (parent.type !== 'Property' || parent.value === node)
            && (parent.type !== 'MemberExpression' || parent.object === node)
            && (initName = isNonAssignedSimpleAssignedVar(name, getBindingScope(scope, name)))) {
            return t.identifier(initName);
        }
    }
}});


var myPlugin4 = new Plugin('var-decl-remover', { visitor: {
    VariableDeclarator: function(node, parent, scope, conf) {
        var name = node.id.name;
        if (isNonAssignedSimpleAssignedVar(name, scope)) {
            this.dangerouslyRemove();
        }
    }
}});

var hasGlobalDeclarations, globalScope;
var myPlugin5 = new Plugin('closure-wrapper', { visitor: {
    Program: {
        enter: function(node, parent, scope, conf) {
            globalScope = scope;
        },
        exit: function(node, parent, scope, conf) {
            if (hasGlobalDeclarations) {
                return t.program([t.callExpression(t.functionExpression(null, [],t.blockStatement(node.body)),[])]);
            }
        }
    },
    VariableDeclaration: function(node, parent, scope, conf) {
        if (scope === globalScope) {
            hasGlobalDeclarations = true;
        }
    },
    FunctionDeclaration: function(node, parent, scope, conf) {
        if (scope === globalScope) {
            hasGlobalDeclarations = true;
        }
    }
}});

function processModulesHelper(metadata, exports, allModules, processed, file) {
    if (!processed[file]) {
        processed[file] = true;
        allModules[file] = true;
        var changed = false;
        if (path.extname(file) === '.js') {
            var modTime = getFileModTime(file),
                fileData = metadata.files[file] || (metadata.files[file] = {});
            if (isModTimeOld(modTime, fileData.lastModTime)) {
                dependencies = [];
                setsExportProperty = false;
                assignedIdentifiers = {};
                simpleAssignmentDeclarations = {};
                hasGlobalDeclarations = false;
                exportName = exports[file];
                var code = babelCore.transformFileSync(file, {
                    plugins: [
                        {
                            transformer: myPlugin,
                            position: 'after'
                        },
                        {
                            transformer: myPlugin2,
                            position: 'after'
                        },
                        {
                            transformer: myPlugin3,
                            position: 'after'
                        },
                        {
                            transformer: myPlugin4,
                            position: 'after'
                        },
                        {
                            transformer: myPlugin5,
                            position: 'after'
                        }
                    ],
                    optional: ["utility.inlineEnvironmentVariables"],
                    blacklist: ["strict"]
                }).code;
                writeCacheFile(file, code + ';\n');
                fileData.dependencies = dependencies;
                fileData.lastModTime = modTime;
                fileData.setsExportProperty = setsExportProperty;
                dependencies = null;
                assignedIdentifiers = null;
                simpleAssignmentDeclarations = null;
                changed = true;
            }
            var deps = fileData.dependencies;
            for (var i = 0; i < deps.length; i++) {
                allModules[deps[i]] = true;
                if (processModulesHelper(metadata, exports, allModules, processed, deps[i])) {
                    changed = true;
                }
            }
        }
        return changed;
    } else {
        return false;
    }
}


var foo = module.exports = function(entryModule, exports) {
    currentWorkingDir = process.cwd();
    var newExports = {};
    if (exports) {
        for (var module in exports) {
            if (exports.hasOwnProperty(module)) {
                var resolved = resolve.sync(module, {basedir: currentWorkingDir});
                newExports[resolved] = exports[module];
            }
        }
    }
    var metadata = readMetadata();
    if (!metadata.files) {
        metadata.files = {};
    }
    if (!metadata.idents) {
        metadata.idents = {};
    }
    currentIdents = metadata.idents;
    usedIdents = getObjectValuesAsSet(currentIdents);
    var allModules = {};
    var entryFile = resolve.sync(entryModule, { basedir: currentWorkingDir });
    var changed = processModulesHelper(metadata, newExports, allModules, {}, entryFile);
    if (changed) {
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
        metadata.modTime = Date.now();
        writeMetadata(metadata);
        var outFile = 'bundle.js';
        var orderedDeps = dependencySort(arrayDeps);
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
        fs.writeFileSync(outFile, header);
        for (var i = 0; i < orderedDeps.length; i++) {
            var file = orderedDeps[i];
            fs.appendFileSync(outFile, fs.readFileSync(getCachePath(file)));
        }
        fs.appendFileSync(outFile, '\n})();');
    }
};

function getCachePath(absPath) {
    var relPath = path.relative(currentWorkingDir, absPath).replace(/\.\.\//g, '__/');
    return path.resolve(currentWorkingDir, '.module_cache', relPath);
}

function writeCacheFile(file, content) {
    var cachePath = getCachePath(file, currentWorkingDir);
    mkdirp.sync(path.dirname(cachePath));
    fs.writeFileSync(cachePath, content + ';\n');
}

function readMetadata() {
    try {
        return JSON.parse(fs.readFileSync('.module_cache/metatdata.json')) || {};
    } catch (e) {
        return {};
    }
}

function writeMetadata(data) {
    mkdirp.sync('.module_cache');
    fs.writeFileSync('.module_cache/metatdata.json', JSON.stringify(data));
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

function getObjectValuesAsSet(obj) {
    var ret = {};
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            ret[obj[key]] = true;
        }
    }
    return ret;
}

if (process.env.NODE_ENV === 'development') {
    console.log('we are develop.');
}

foo('react', {'react': 'React'});




