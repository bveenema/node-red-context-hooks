/**
 * Subscription Registry for demand-driven events
 * Manages subscriptions and provides wildcard matching
 */

const EventEmitter = require('events');
const emitter = new EventEmitter();
emitter.setMaxListeners(100); // Increase max listeners

// Registry to store subscriptions
const subscriptions = new Map();

// Track change operations - each distinct property change gets a unique change token
let currentChangeToken = 0;

// Store compiled RegExp objects for regex patterns
const regexCache = new Map();

/**
 * Register a subscription for a property pattern
 * @param {string} pattern - Property pattern (string with optional wildcards or regex)
 * @param {string} patternType - Type of pattern: "str" or "re"
 * @param {Function} callback - Callback to call when the property changes
 * @returns {Object} - An object with an unsubscribe method
 */
function subscribe(pattern, patternType, callback) {
    // // For backward compatibility - if patternType is a function, it's the callback
    // if (typeof patternType === 'function') {
    //     callback = patternType;
    //     patternType = 'str'; // Default to string type (which handles wildcards)
    // }
    
    // // Handle legacy 'wild' type for backward compatibility
    // if (patternType === 'wild') {
    //     patternType = 'str'; // Convert to string type
    // }
    
    // Generate a unique key for this subscription
    const subKey = `${patternType}:${pattern}`;
    
    // Add to subscriptions map
    if (!subscriptions.has(subKey)) {
        subscriptions.set(subKey, {
            pattern,
            patternType,
            callbacks: new Set()
        });
        
        // For regex patterns, compile and cache the RegExp object
        if (patternType === 're' && !regexCache.has(pattern)) {
            try {
                regexCache.set(pattern, new RegExp(pattern));
            } catch (error) {
                console.error(`Invalid regex pattern: ${pattern}`, error);
                // Use an impossible regex (will never match anything)
                regexCache.set(pattern, /^$/);
            }
        }
    }
    
    // Add this callback to the set
    subscriptions.get(subKey).callbacks.add(callback);
    
    // Return unsubscribe function
    return {
        unsubscribe: () => {
            const sub = subscriptions.get(subKey);
            if (sub) {
                sub.callbacks.delete(callback);
                if (sub.callbacks.size === 0) {
                    subscriptions.delete(subKey);
                }
            }
        }
    };
}

/**
 * Check if a property matches a pattern, considering pattern type
 * @param {string} property - The property path
 * @param {string} pattern - The pattern
 * @param {string} patternType - Type of pattern: "str" or "re"
 * @returns {boolean} - Whether the property matches the pattern
 */
function matchesPattern(property, pattern, patternType) {
    // Handle different pattern types
    switch (patternType) {
        case 're': // Regex pattern
            const regex = regexCache.get(pattern) || new RegExp(pattern);
            return regex.test(property);
            
        case 'str': // String pattern (may include wildcards)
        default:
            // If pattern contains wildcard, use wildcard matching
            if (pattern.includes('*')) {
                return matchesWildcardPattern(property, pattern);
            }
            
            // Direct match
            if (property === pattern) {
                return true;
            }
            
            // Check if pattern is an ancestor of property
            return property.startsWith(pattern + '.');
    }
}

/**
 * Check if a property matches a wildcard pattern
 * @param {string} property - The property path
 * @param {string} pattern - The wildcard pattern (with * characters)
 * @returns {boolean} - Whether the property matches the pattern
 */
function matchesWildcardPattern(property, pattern) {
    // Split both into parts
    const patternParts = pattern.split('.');
    const propertyParts = property.split('.');
    
    // Property must have at least as many parts as the pattern
    if (propertyParts.length < patternParts.length) {
        return false;
    }
    
    // Check each pattern part against the corresponding property part
    for (let i = 0; i < patternParts.length; i++) {
        const patternPart = patternParts[i];
        const propertyPart = propertyParts[i];
        
        // If this part is a wildcard, it matches anything
        if (patternPart === '*') {
            continue;
        }
        
        // Otherwise, parts must match exactly
        if (patternPart !== propertyPart) {
            return false;
        }
    }
    
    // All pattern parts matched, so this is a match
    return true;
}

/**
 * Get the next change token for tracking operation batches
 * @returns {number} - A unique token for this change operation
 */
function getNextChangeToken() {
    return ++currentChangeToken;
}

/**
 * Publish a property change event and notify relevant subscribers
 * @param {string} property - The property that changed
 * @param {any} data - The change data object
 * @param {Object} options - Additional options for publication
 * @param {number} options.changeToken - Optional token to use for this change (for grouping related changes)
 * @param {boolean} options.isPropagated - Whether this is a propagated parent notification
 */
function publish(property, data, options = {}) {
    const changeToken = options.changeToken || getNextChangeToken();
    const isPropagated = options.isPropagated || false;
    
    // Add change token and propagated flag to data
    const enhancedData = {
        ...data,
        changeToken,
        isPropagated
    };
    
    // Find all matching patterns and notify their callbacks
    for (const [subKey, sub] of subscriptions.entries()) {
        const { pattern, patternType, callbacks } = sub;
        
        if (matchesPattern(property, pattern, patternType)) {
            // Add pattern info to the data for this subscriber
            const subscriberData = {
                ...enhancedData,
                subscribedPattern: pattern,
                patternType
            };
            
            // Notify all callbacks for this pattern
            for (const callback of callbacks) {
                try {
                    callback(property, subscriberData);
                } catch (err) {
                    console.error(`Error in subscription callback for ${pattern}:`, err);
                }
            }
        }
    }
    
    // Also emit on the standard emitter for backward compatibility
    emitter.emit(property, enhancedData);
}

/**
 * Get all registered patterns
 * @returns {Array} - Array of pattern objects with pattern and type
 */
function getPatterns() {
    return Array.from(subscriptions.entries()).map(([_, sub]) => ({
        pattern: sub.pattern,
        type: sub.patternType
    }));
}

/**
 * Clear all subscriptions
 */
function clearSubscriptions() {
    subscriptions.clear();
    regexCache.clear();
}

module.exports = {
    subscribe,
    publish,
    getPatterns,
    clearSubscriptions,
    emitter,  // Export the emitter for backward compatibility
    getNextChangeToken
}; 