const { subscribe } = require('../../events/emitter');

module.exports = function(RED) {
    function SubscribeState(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Ensure properties is an array
        const properties = Array.isArray(config.properties) ? config.properties : (config.property ? [config.property] : []);
        
        // Skip empty properties
        const validProperties = properties.filter(prop => prop && prop.trim() !== '');
        
        // Get the global context to access its methods
        const global = node.context().global;
        
        // Store subscriptions so we can unsubscribe later
        const subscriptions = [];
        
        // Use a Map instead of Set to track tokens with timestamps
        // This reduces memory and allows time-based cleanup
        // Format: { token => timestamp }
        const processedTokens = new Map();
        
        // Max number of tokens to remember (to prevent memory leaks)
        const MAX_TOKENS = 1000;
        
        // Time to keep tokens in memory (5 minutes)
        const TOKEN_RETENTION_MS = 5 * 60 * 1000;
        
        // Periodically clean up old tokens
        const cleanupInterval = setInterval(() => {
            const now = Date.now();
            // Remove tokens older than retention period
            processedTokens.forEach((timestamp, token) => {
                if (now - timestamp > TOKEN_RETENTION_MS) {
                    processedTokens.delete(token);
                }
            });
        }, 60000); // Check every minute
        
        // Function to process property changes
        const processChange = (changedProperty, data) => {
            const { 
                previousValue, 
                value, 
                changedPath, 
                changedProperty: nestedChangedProperty, 
                deepChange,
                changeToken,
                isPropagated
            } = data;
            
            // If we've already processed this token for this subscription node, skip
            if (processedTokens.has(changeToken)) {
                return;
            }
            
            // Record that we've processed this token with current timestamp
            processedTokens.set(changeToken, Date.now());
            
            // Prune the map if it gets too large
            if (processedTokens.size > MAX_TOKENS) {
                // Keep only the most recent tokens
                const entries = Array.from(processedTokens.entries())
                    .sort((a, b) => b[1] - a[1]) // Sort by timestamp descending
                    .slice(0, Math.floor(MAX_TOKENS / 2)); // Keep only half
                
                processedTokens.clear();
                entries.forEach(([token, time]) => processedTokens.set(token, time));
            }
            
            // Find which of our subscribed properties matches this change
            const matchingProperty = validProperties.find(prop => {
                // For wildcards, we already know it's a match (handled by registry)
                if (prop.includes('*')) {
                    return true;
                }
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
            
            // For propagated events, only process them if we're watching the parent directly
            if (isPropagated && changedProperty !== matchingProperty) {
                return;
            }
            
            // If the matching property is a wildcard, handle it differently
            if (matchingProperty.includes('*')) {
                // For wildcard matches, just send the exact property that changed
                node.send({
                    property: changedProperty,
                    subscribedPattern: matchingProperty,
                    previousValue,
                    value,
                    payload: value,
                    isWildcardMatch: true
                });
                return;
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
                    msg.changedPath = changedPath;
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
        
        // Setup subscriptions for all properties
        validProperties.forEach(prop => {
            // Subscribe to the pattern
            const subscription = subscribe(prop, processChange);
            subscriptions.push(subscription);
            
            // Log information about the subscription
            node.status({ fill: "green", shape: "dot", text: `Subscribed: ${validProperties.join(', ')}` });
        });
        
        // Cleanup subscriptions when node is removed
        node.on('close', () => {
            // Unsubscribe from all patterns
            subscriptions.forEach(sub => sub.unsubscribe());
            
            // Clear the cleanup interval
            clearInterval(cleanupInterval);
            
            // Clear the token map to free memory
            processedTokens.clear();
        });
    }

    RED.nodes.registerType('subscribe-state', SubscribeState);
}