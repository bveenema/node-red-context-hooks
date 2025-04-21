const { subscribe } = require('../../events/emitter');
const PubSub = require('pubsub-js');

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
        
        // Setup subscriptions for all properties
        validProperties.forEach(prop => {
            node.log(`Subscribing to ${prop.pattern} with type ${prop.type}`)
            PubSub.subscribe(prop.pattern, (topic, data) => {

                // If we've already processed this token for this subscription node, skip
                if (data.changeToken && processedTokens.has(data.changeToken)) {
                    // node.warn(`[subscribe - ${this.name}] Already processed this token:  ${data.changeToken}`)
                    return;
                }

                // // if the changedPath is a subset of the subscribedPattern, get the subscribedPattern from global context
                // // ex. (subscribedPattern = 'a.b    ', changedPath = 'a.b.c') -> get subscribedPattern from global context
                // let fullObject;
                // if (data.pubKey !== prop.pattern) {
                //     fullObject = global.get(prop.pattern);
                //     node.warn(`[subscribe - ${this.name}] Full object: ${JSON.stringify(fullObject)}`)
                // }

                // Filter changedPaths to only those pertaining to the subscribe.
                // Calculate Changed Properties - Properties are the relative paths of the changedPaths
                const changedPaths = data.changedPaths.filter(path => path.startsWith(`${prop.pattern}.`))
                const changedProperties = changedPaths.map(path => path.replace(`${prop.pattern}.`, ''));

                // Send the message
                node.send({
                    payload: data.value,
                    previousValue: data.previousValue,
                    changedPaths: [prop.pattern, ...changedPaths],
                    changedProperties: changedProperties,
                    subscribedPattern: prop.pattern,
                    pubKey: data.pubKey
                });

                // Record that we've processed this token with current timestamp
                processedTokens.set(data.changeToken, Date.now());

                // Prune the token map if it gets too large
                if (processedTokens.size > MAX_TOKENS) {
                    // Keep only the most recent tokens
                    const entries = Array.from(processedTokens.entries())
                        .sort((a, b) => b[1] - a[1]) // Sort by timestamp descending
                        .slice(0, Math.floor(MAX_TOKENS / 2)); // Keep only half
                    
                    processedTokens.clear();
                    entries.forEach(([token, time]) => processedTokens.set(token, time));
                }
            });
            
            // // Subscribe to the pattern
            // const subscription = subscribe(prop.pattern, prop.type, processChange);
            // subscriptions.push(subscription);
            
            // // Log information about the subscription
            // let typeName = prop.type === 'str' ? 
            //     (prop.pattern.includes('*') ? 'Wildcard' : 'String') : 
            //     'RegExp';
            // node.status({ fill: "green", shape: "dot", text: `${validProperties.length} subscriptions` });
        });
        
        // Cleanup subscriptions when node is removed
        node.on('close', () => {
            // Unsubscribe from all patterns
            validProperties.forEach(prop => {
                node.log(`Unsubscribing to ${prop.pattern}`)
                PubSub.unsubscribe(prop.pattern);
            });
            
            // Clear the token cleanup interval
            clearInterval(cleanupInterval);
            
            // Clear the token map to free memory
            processedTokens.clear();
        });
    }

    RED.nodes.registerType('subscribe-state', SubscribeState);
}