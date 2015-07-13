var t = require('babel-core').types;

module.exports = {
    name: 'closure-wrapper',
    create: function (opts) {
        var globalScope, hasGlobalDeclarations;
        return {
            init: function (filePath, metaData, fileData) {
                hasGlobalDeclarations = false;
            },
            cleanup: function () {
                globalScope = null;
            },
            transformers: [{
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
                    if (scope.parent === globalScope) {
                        hasGlobalDeclarations = true;
                    }
                }
            }]
        };

    }
};