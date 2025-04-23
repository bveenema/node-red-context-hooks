const PubSub = require('pubsub-js');
const jsonata = require('jsonata');
const {get, cloneDeep} = require('lodash');

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
            .map((prop, i) => {
                const pattern = prop.trim();
                let type = propertyTypes[i] || "str";
                
                // If pattern contains wildcard but type is str, treat as wildcard
                if (type === "str" && pattern.includes('*')) {
                    type = "wildcard";
                }
                
                return { pattern, type };
            });
        
        // Get the global context to access its methods
        const global = node.context().global;
        
        // Store subscriptions so we can unsubscribe later
        const subscriptions = [];
        
        // Use a Map instead of Set to track tokens with timestamps
        // This reduces memory and allows time-based cleanup
        // Format: { token_pattern => timestamp }
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

        // Handler factory function to create handlers for both static and dynamic subscriptions
        const handlerFor = (pattern) => {
            return (topic, data) => {
                // Create a composite key of changeToken and pattern
                const tokenKey = data.changeToken ? `${data.changeToken}_${pattern}` : null;
                
                // If we've already processed this token for this specific pattern, skip
                if (tokenKey && processedTokens.has(tokenKey)) {
                    return;
                }

                // Filter changedPaths to only those pertaining to the subscribe.
                // Calculate Changed Properties - Properties are the relative paths of the changedPaths
                const changedPaths = data.changedPaths.filter(path => path.startsWith(`${pattern}.`));
                const changedProperties = changedPaths.map(path => path.replace(`${pattern}.`, ''));

                // Send the message
                node.send({
                    payload: data.value,
                    previousValue: data.previousValue,
                    changedPaths: [pattern, ...changedPaths],
                    changedProperties: changedProperties,
                    subscribedPattern: pattern,
                    pubKey: data.pubKey
                });

                // Record that we've processed this token with current timestamp
                if (tokenKey) {
                    processedTokens.set(tokenKey, Date.now());

                    // Prune the token map if it gets too large
                    if (processedTokens.size > MAX_TOKENS) {
                        // Keep only the most recent tokens
                        const entries = Array.from(processedTokens.entries())
                            .sort((a, b) => b[1] - a[1]) // Sort by timestamp descending
                            .slice(0, Math.floor(MAX_TOKENS / 2)); // Keep only half
                        
                        processedTokens.clear();
                        entries.forEach(([token, time]) => processedTokens.set(token, time));
                    }
                }
            };
        };

        // Build matcher based on subscription type
        const buildMatcher = (prop) => {
            switch (prop.type) {
                case 'str':
                    return topic => topic === prop.pattern;
                
                case 'wildcard':
                    // Create a custom pattern matcher that supports dot notation with wildcards
                    // Pre-compile the regex from the wildcard pattern
                    const wildcardPattern = prop.pattern.replace(/\./g, '\\.').replace(/\*/g, '[^.]*');
                    const wildcardRegex = new RegExp(`^${wildcardPattern}$`);
                    
                    return topic => {
                        // topic should be an array of changedPaths
                        if(!Array.isArray(topic)) {
                            node.error(`Topic is not an array: ${topic}`);
                            return false;
                        }                     

                        // return all paths that match the pattern using the pre-compiled regex
                        return topic.filter(path => wildcardRegex.test(path));
                    };
                
                case 'regex':
                    try {
                        const regex = new RegExp(prop.pattern);
                        return topic => {
                            // topic should be an array of changedPaths
                            if(!Array.isArray(topic)) {
                                node.error(`Topic is not an array: ${topic}`);
                                return false;
                            }

                            // return all paths that match the pattern
                            return topic.filter(path => regex.test(path));
                        };
                    } catch (e) {
                        node.error(`Invalid regex pattern: ${prop.pattern}`);
                        return () => false;
                    }
                
                case 'jsonata':
                    try {
                        const expr = jsonata(prop.pattern);
                        return (topic, value) => {
                            try {
                                return !!expr.evaluate(value);
                            } catch (e) {
                                node.error(`JSONata evaluation error: ${e.message}`);
                                return false;
                            }
                        };
                    } catch (e) {
                        node.error(`Invalid JSONata expression: ${prop.pattern}`);
                        return () => false;
                    }
                
                default:
                    return () => false;
            }
        };
        
        // Separate static and dynamic subscriptions
        const staticSubs = validProperties.filter(prop => prop.type === 'str');
        const dynamicProps = validProperties.filter(prop => prop.type !== 'str')
                                           .map(prop => ({ 
                                               matcher: buildMatcher(prop), 
                                               cfg: prop 
                                           }));

        // Setup subscriptions for all static properties
        staticSubs.forEach(prop => {
            node.log(`Subscribing to static pattern: ${prop.pattern}`);
            const handler = handlerFor(prop.pattern);
            // Store the subscription token for cleanup
            const token = PubSub.subscribe(prop.pattern, handler);
            subscriptions.push({ pattern: prop.pattern, token });
        });
        
        // Setup dynamic subscription if needed
        if (dynamicProps.length > 0) {
            node.log(`Setting up dynamic subscription with ${dynamicProps.length} patterns`);
            
            // Create a single subscription to the context update firehose
            const dynamicToken = PubSub.subscribe('__context_update__', (topic, data) => {
                if (!data || !data.pubKey) return;
                
                dynamicProps.forEach(({matcher, cfg}) => {
                    let matched = [];
                    if(cfg.type === 'jsonata') {
                        matched = matcher(data.pubKey, data.value);
                    } else if(cfg.type === 'wildcard') {
                        matched = matcher(data.changedPaths);
                    } else if(cfg.type === 'regex') {
                        matched = matcher(data.changedPaths);
                    }

                    if (matched.length > 0) {
                        // Use the same handler logic as static subscriptions
                        matched.forEach(path => {
                            const dataClone = cloneDeep(data);
                            dataClone.value = get(dataClone.value, path);
                            dataClone.previousValue = get(dataClone.previousValue, path);
                            handlerFor(path)(null, dataClone);
                        });
                    }
                });
            });
            
            // Store the subscription for cleanup
            subscriptions.push({ pattern: '__context_update__', token: dynamicToken });
        }
        
        // Cleanup subscriptions when node is removed
        node.on('close', () => {
            // Unsubscribe from all patterns
            subscriptions.forEach(sub => {
                node.log(`Unsubscribing from ${sub.pattern}`);
                PubSub.unsubscribe(sub.token);
            });
            
            // Clear the token cleanup interval
            clearInterval(cleanupInterval);
            
            // Clear the token map to free memory
            processedTokens.clear();
        });
    }

    RED.nodes.registerType('subscribe-context', SubscribeState);
}