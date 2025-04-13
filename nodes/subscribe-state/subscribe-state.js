const { getEmitter } = require('../../events/emitter');

module.exports = function(RED) {
    function SubscribeState(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        const { property } = config;
        const emitter = getEmitter();
        const listeners = new Map();
        
        // Get the global context to access its methods
        const global = node.context().global;
        
        // Function to process property changes
        const processChange = (changedProperty, data) => {
            const { previousValue, value, changedPath: nestedChangedPath, changedProperty: nestedChangedProperty, deepChange } = data;
            
            // For direct property match, just send it
            if (changedProperty === property) {
                // Construct the message
                const msg = {
                    property,
                    previousValue,
                    value,
                    payload: value,
                };
                
                // If this was a nested property change, include that information
                if (deepChange) {
                    msg.changedPath = nestedChangedPath;
                    msg.changedProperty = nestedChangedProperty;
                    msg.deepChange = true;
                }
                
                node.send(msg);
                return;
            }
            
            // For deep property changes, get the parent object and send additional info
            if (changedProperty.startsWith(property + '.')) {
                const fullObject = global.get(property);
                node.send({
                    property: changedProperty,
                    changedProperty: changedProperty.substring(property.length + 1),
                    parentProperty: property,
                    previousValue,
                    value,
                    fullObject,
                    payload: fullObject,
                });
            }
        };
        
        // Add listener for the main property
        listeners.set(property, (data) => processChange(property, data));
        emitter.on(property, listeners.get(property));

        // Store all existing properties from global context for initial setup
        const setupDeepListeners = () => {
            // Get all keys from global context
            const keys = global.keys();
            
            // Add listeners for relevant properties
            keys.forEach(key => {
                // If this is a nested property of our target property
                if (key !== property && key.startsWith(property + '.')) {
                    if (!listeners.has(key)) {
                        listeners.set(key, (data) => processChange(key, data));
                        emitter.on(key, listeners.get(key));
                    }
                }
            });
        };
        
        // Initial setup of listeners
        setupDeepListeners();
        
        // Periodically check for new properties and add listeners
        const intervalId = setInterval(setupDeepListeners, 10000);

        node.on('close', () => {
            // Remove all our listeners
            for (const [key, listener] of listeners.entries()) {
                emitter.removeListener(key, listener);
            }
            listeners.clear();
            
            // Clear the interval
            clearInterval(intervalId);
        });
    }

    RED.nodes.registerType('subscribe-state', SubscribeState);
}