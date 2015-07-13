var t = require('babel-core').types;

function getBindingScope(scope, name) {
    do {
        if (scope.bindings[name]) return scope;
    } while (scope = scope.parent);
    return null;
}

module.exports = {
    name: 'simple-var-declaration-replacer',
    create: function(opts) {

        var assignedIdentifiers;
        var simpleAssignmentDeclarations;

        // TODO: rename
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

        var simpleAssignmentCheckerTransformer = {
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
        };


        var identifierReplacerTransformer = {
            Identifier: function(node, parent, scope, conf) {
                var name = node.name, initName;
                if ((parent.type !== 'VariableDeclarator' || parent.init === node)
                    && (parent.type !== 'Property' || parent.value === node)
                    && (parent.type !== 'MemberExpression' || parent.object === node)
                    && (initName = isNonAssignedSimpleAssignedVar(name, getBindingScope(scope, name)))) {
                    return t.identifier(initName);
                }
            }
        };


        var varDeclarationRemoverTransformer = {
            VariableDeclarator: function(node, parent, scope, conf) {
                var name = node.id.name;
                if (isNonAssignedSimpleAssignedVar(name, scope)) {
                    this.dangerouslyRemove();
                }
            }
        };

        return {
            init: function(filePath, metaData, fileData) {
                assignedIdentifiers = {};
                simpleAssignmentDeclarations = {};
            },
            cleanup: function() {
                assignedIdentifiers = null;
                simpleAssignmentDeclarations = null;
            },
            transformers: [
                simpleAssignmentCheckerTransformer,
                identifierReplacerTransformer,
                varDeclarationRemoverTransformer
            ]
        };

    }
};