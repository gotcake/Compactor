var t = require('babel-core').types;
var resolve = require('resolve');
var path = require('path');

var defaultExtensions = ['', '.js', '.json', '.node'];

module.exports = {
    name: 'common-js-transformer',
    create: function(opts) {

        var data, metaData, file, workingDir, usedIdents, currentIdents,
            extensions = opts.searchExtensions || defaultExtensions;

        function getIdent(file) {
            var ident = currentIdents[file];
            if (!ident) {
                ident = path.relative(process.cwd(), file);
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

        return {
            init: function(filePath, _metaData, fileData) {
                file = filePath;
                workingDir = path.dirname(file);
                data = fileData;
                metaData = _metaData;
                data.dependencies = [];
                data.setsExportProperty = false;
                currentIdents = metaData.idents || (metaData.idents = {});
                usedIdents = getObjectValuesAsSet(currentIdents);
            },
            cleanup: function() {
                file = null;
                data = null;
                metaData = null;
                workingDir = null;
            },
            transformers: [{
                Program: function(node) {
                    if (metaData.opts.exports[file]) {
                        node.body.push(t.assignmentExpression('=',
                            t.memberExpression(t.identifier('window'), t.identifier(metaData.opts.exports[file])),
                            getIdent(file)
                        ));
                    }
                },
                CallExpression: function(node) {
                    var args;
                    if (node.callee.type === 'Identifier'
                        && node.callee.name === 'require'
                        && (args = node.arguments).length === 1
                        && args[0].type === 'Literal') {
                        var moduleName = args[0].value;
                        var filePath = resolve.sync(moduleName, { basedir: workingDir, extensions: extensions });
                        data.dependencies.push(filePath);
                        return getIdent(filePath);
                    }
                },
                ExpressionStatement: function(node) {
                    // TODO: maybe move this to another plugin
                    if (node.expression.type === 'Literal' && node.expression.value === 'use strict') {
                        this.dangerouslyRemove();
                    }
                },
                MemberExpression: function(node) {
                    if (node.object.type === 'Identifier'
                        && node.object.name === 'module'
                        && node.property.type === 'Identifier'
                        && node.property.name === 'exports') {
                        return getIdent(file);
                    }
                },
                Identifier: function(node, parent) {
                    if (node.name === 'exports') {
                        if (parent.type === 'AssignmentExpression' && parent.left === node && parent.operator === '=') {
                            setsExportProperty = true;
                        }
                        if (parent.type === 'MemberExpression' && parent.property === node) {
                            return;
                        }
                        return getIdent(file);
                    }
                }
            }]
        };

    }
};

function getObjectValuesAsSet(obj) {
    var ret = {};
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            ret[obj[key]] = true;
        }
    }
    return ret;
}

