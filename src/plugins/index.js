var Plugin = require('babel-core').Plugin;

module.exports = function(opts) {

    var plugins = [];
    var initFns = [];
    var cleanUpFns = [];
    var pluginOpts = opts.plugin || {};

    /**
     * Runs the init method for all plugins
     * @type {function(string, Object, Object)}
     */
    plugins.init = function(file, metaData, fileData) {
        for (var i = 0; i < initFns.length; i++) {
            initFns[i](file, metaData, fileData);
        }
    };

    /**
     * Runs cleanup for all plugins
     * @type {function(this:Array)}
     */
    plugins.cleanup = function() {
        for (var i = 0; i < cleanUpFns.length; i++) {
            cleanUpFns[i]();
        }
    };

    /**
     * Registers one or more plugins
     * @param {{name:string, create:function(Object=)}} plugin
     */
    function registerPlugin(plugin) {
        var name = plugin.name;
        var instance = plugin.create(pluginOpts[name] || {});
        for (var i = 0; i < instance.transformers.length; i++) {
            plugins.push(new Plugin(name + i, {
                visitor: instance.transformers[i]
            }));
        }
        if (typeof instance.init === 'function') {
            initFns.push(instance.init);
        }
        if (typeof instance.cleanup === 'function') {
            cleanUpFns.push(instance.cleanup);
        }
    }

    registerPlugin(require('./CommonJsTransformer'));
    registerPlugin(require('./SimpleVarDeclarationReplacer'));
    registerPlugin(require('./ClosureWrapper'));

    return plugins;

};