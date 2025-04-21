/**
 * Event emitter module - redirects to registry for demand-driven approach
 * Provides backward compatibility with existing code
 */

const registry = require('./registry');

module.exports = {
    // For backward compatibility
    getEmitter: () => registry.emitter,
    
    // New methods
    subscribe: registry.subscribe,
    publish: registry.publish,
    getPatterns: registry.getPatterns,
    clearSubscriptions: registry.clearSubscriptions,
    // getNextChangeToken: registry.getNextChangeToken
};