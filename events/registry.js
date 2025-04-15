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

/**
 * Register a subscription for a property pattern
 * @param {string} pattern - Property pattern (can include wildcards: *)
 * @param {Function} callback - Callback to call when the property changes
 * @returns {Object} - An object with an unsubscribe method
 */
function subscribe(pattern, callback) {
    // Add to subscriptions map
    if (!subscriptions.has(pattern)) {
        subscriptions.set(pattern, new Set());
    }
    subscriptions.get(pattern).add(callback);
    
    // Return unsubscribe function
    return {
        unsubscribe: () => {
            const callbacks = subscriptions.get(pattern);
            if (callbacks) {
                callbacks.delete(callback);
                if (callbacks.size === 0) {
                    subscriptions.delete(pattern);
                }
            }
        }
    };
}

/**
 * Check if a property matches a pattern (with wildcard support)
 * @param {string} property - The property path
 * @param {string} pattern - The pattern (can include *)
 * @returns {boolean} - Whether the property matches the pattern
 */
function matchesPattern(property, pattern) {
    // Direct match
    if (property === pattern) {
        return true;
    }
    
    // If pattern contains wildcard
    if (pattern.includes('*')) {
        // Convert pattern to regex
        const regexPattern = pattern
            .replace(/\./g, '\\.')  // Escape dots
            .replace(/\*/g, '.*');  // Replace * with .*
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(property);
    }
    
    // Check if property is a direct child of pattern
    if (pattern.endsWith('.*')) {
        const prefix = pattern.slice(0, -2);
        const parts = property.split('.');
        return property.startsWith(prefix + '.') && parts.length === prefix.split('.').length + 1;
    }
    
    // Nested property match (property starts with pattern followed by dot)
    return property.startsWith(pattern + '.'); 
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
    
    // Find all matching patterns
    for (const [pattern, callbacks] of subscriptions.entries()) {
        if (matchesPattern(property, pattern)) {
            // Notify all callbacks for this pattern
            for (const callback of callbacks) {
                try {
                    callback(property, enhancedData);
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
 * @returns {Array} - Array of patterns
 */
function getPatterns() {
    return Array.from(subscriptions.keys());
}

/**
 * Clear all subscriptions
 */
function clearSubscriptions() {
    subscriptions.clear();
}

module.exports = {
    subscribe,
    publish,
    getPatterns,
    clearSubscriptions,
    emitter,  // Export the emitter for backward compatibility
    getNextChangeToken
}; 