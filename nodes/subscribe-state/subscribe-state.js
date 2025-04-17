const { subscribe } = require('../../events/emitter');

module.exports = function(RED) {
    function SubscribeState(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        // Ensure properties is an array
        const properties = Array.isArray(config.properties) ? config.properties : (config.property ? [config.property] : []);
        
        // Ensure propertyTypes is an array with matching length
        const propertyTypes = Array.isArray(config.propertyTypes) && config.propertyTypes.length === properties.length 
            ? config.propertyTypes 
            : Array(properties.length).fill("str");
        
        // Skip empty properties
        const validProperties = properties.filter((prop, i) => prop && prop.trim() !== '')
            .map((prop, i) => ({ 
                pattern: prop.trim(), 
                type: propertyTypes[i] || "str"
            }));
        
        // Get the global context to access its methods
        const global = node.context().global;
        
        // Store subscriptions so we can unsubscribe later
        const subscriptions = [];
        
        // Use a Map instead of Set to track tokens with timestamps
        // This reduces memory and allows time-based cleanup
        // Format: { token => timestamp }
        const processedTokens = new Map();
        
        // Much lower token limit for memory efficiency
        const MAX_TOKENS = 50;
        
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
                isPropagated,
                subscribedPattern,
                patternType
            } = data;
            
            // If we've already processed this token for this subscription node, skip
            if (processedTokens.has(changeToken)) {
                node.warn(`[subscribe - ${this.name}] Already processed this token:  ${changeToken}`)
                return;
            }

            node.send({
                changedProperty,
                changedPath,
                previousValue,
                value,
                payload: value,
                isPropagated,
                subscribedPattern,
                patternType
            })

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
            
            // // If this is a pattern match
            // if (patternType === 're' || (patternType === 'str' && subscribedPattern.includes('*'))) {
            //     // Get the full object at the matched property path
            //     const fullObject = global.get(changedProperty);
            //     node.warn("[subscribe] Pattern match")
                
            //     // For pattern matches, include the full object along with the value
            //     node.send({
            //         property: changedProperty,
            //         subscribedPattern,
            //         patternType: patternType === 're' ? 'regex' : 'wildcard',
            //         previousValue,
            //         value,
            //         fullObject,
            //         payload: fullObject || value, // Use the full object as payload, fallback to value
            //         isPatternMatch: true
            //     });
            //     return;
            // }
            
            // // For direct property match (string type), use the original logic
            // if (changedProperty === subscribedPattern) {
            //     node.warn(`[subscribe - ${this.name}] Direct property match: ${changedProperty} === ${subscribedPattern}`)
            //     // Construct the message
            //     const msg = {
            //         property: subscribedPattern,
            //         previousValue,
            //         value,
            //         payload: value,
            //     };
                
            //     // If this was a nested property change, include that information
            //     if (deepChange) {
            //         msg.changedPath = changedPath;
            //         msg.changedProperty = nestedChangedProperty;
            //         msg.deepChange = true;
            //     }
                
            //     node.send(msg);
            //     return;
            // }
            
            // // For deep property changes with string type
            // if (changedProperty.startsWith(subscribedPattern + '.')) {
            //     node.warn(`[subscribe - ${this.name}] Deep property change: ${changedProperty} starts with ${subscribedPattern}`)
            //     // Get the full parent object
            //     const fullObject = global.get(subscribedPattern);
            //     node.warn("[subscribe] Deep property change")
            //     node.send({
            //         property: changedProperty,
            //         subscribedProperty: subscribedPattern,
            //         changedProperty: changedProperty.substring(subscribedPattern.length + 1),
            //         previousValue,
            //         value,
            //         fullObject,
            //         payload: fullObject,
            //     });
            // }
        };
        
        // Setup subscriptions for all properties
        validProperties.forEach(prop => {
            // Subscribe to the pattern
            const subscription = subscribe(prop.pattern, prop.type, processChange);
            subscriptions.push(subscription);
            
            // Log information about the subscription
            let typeName = prop.type === 'str' ? 
                (prop.pattern.includes('*') ? 'Wildcard' : 'String') : 
                'RegExp';
            node.status({ fill: "green", shape: "dot", text: `${validProperties.length} subscriptions` });
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