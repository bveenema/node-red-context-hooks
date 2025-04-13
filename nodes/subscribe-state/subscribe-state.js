const { getEmitter } = require('../../events/emitter');

module.exports = function(RED) {
    function SubscribeState(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Ensure properties is an array
        const properties = Array.isArray(config.properties) ? config.properties : (config.property ? [config.property] : []);
        
        // Skip empty properties
        const validProperties = properties.filter(prop => prop && prop.trim() !== '');
        
        const emitter = getEmitter();
        const listeners = new Map();
        
        // Get the global context to access its methods
        const global = node.context().global;
        
        // Function to process property changes
        const processChange = (changedProperty, data) => {
            const { previousValue, value, changedPath: nestedChangedPath, changedProperty: nestedChangedProperty, deepChange } = data;
            
            // Find which of our subscribed properties matches this change
            const matchingProperty = validProperties.find(prop => {
                // Direct match
                if (changedProperty === prop) {
                    return true;
                }
                // Deep match (nested property)
                if (changedProperty.startsWith(prop + '.')) {
                    return true;
                }
                return false;
            });
            
            if (!matchingProperty) {
                return; // Not relevant to our subscriptions
            }
            
            // For direct property match, just send it
            if (changedProperty === matchingProperty) {
                // Construct the message
                const msg = {
                    property: matchingProperty,
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
            if (changedProperty.startsWith(matchingProperty + '.')) {
                const fullObject = global.get(matchingProperty);
                node.send({
                    property: changedProperty,
                    subscribedProperty: matchingProperty,
                    changedProperty: changedProperty.substring(matchingProperty.length + 1),
                    previousValue,
                    value,
                    fullObject,
                    payload: fullObject,
                });
            }
        };
        
        // Setup listeners for all properties
        const setupListeners = () => {
            // For each valid property, set up a direct listener
            validProperties.forEach(prop => {
                if (!listeners.has(prop)) {
                    listeners.set(prop, (data) => processChange(prop, data));
                    emitter.on(prop, listeners.get(prop));
                }
            });
        };
        
        // Store all existing properties from global context for deep subscription
        const setupDeepListeners = () => {
            // Get all keys from global context
            const keys = global.keys();
            
            // For each valid property, set up deep listeners
            validProperties.forEach(prop => {
                // Add listeners for relevant properties
                keys.forEach(key => {
                    // If this is a nested property of our target property
                    if (key !== prop && key.startsWith(prop + '.')) {
                        if (!listeners.has(key)) {
                            listeners.set(key, (data) => processChange(key, data));
                            emitter.on(key, listeners.get(key));
                        }
                    }
                });
            });
        };
        
        // Initial setup of listeners
        setupListeners();
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