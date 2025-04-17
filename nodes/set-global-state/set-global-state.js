const { isEqual, cloneDeep, merge } = require('lodash');
const { publish, getNextChangeToken } = require('../../events/emitter');
const PubSub = require('pubsub-js');

module.exports = function(RED) {
    function SetGlobalState(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        let { property } = config;
        const global = node.context().global;

        // Function to publish events for property and all parent paths
        const publishPropertyAndParents = (propPath, previousValue, value) => {
            node.warn("[publish] Publish property and parents:")
            node.warn(propPath);
            node.warn(previousValue);
            node.warn(value);
            // Generate a single change token for this entire operation
            const changeToken = getNextChangeToken();
            
            // For top-level property updates, just publish for the exact property
            if (!propPath.includes('.')) {
                node.warn(`[publish - ${propPath}] top-level property update`)
                publish(propPath, {
                    previousValue,
                    value,
                    changedPath: propPath,
                    changedProperty: propPath,
                    deepChange: false
                }, { changeToken });
                return;
            }

            // For nested properties, we need to handle parent paths carefully
            const parts = propPath.split('.');
            for (let i = 1; i < parts.length; i++) {
                // Get the parent path at this level
                const parentPath = parts.slice(0, i).join('.');
                node.warn(`[publish - ${propPath}] Parent path: ${parentPath}`);
                
                // Get the parent objects
                const parentPreviousValue = global.get(parentPath);
                const parentCurrentValue = global.get(parentPath);
                
                // Publish the event for this intermediate parent
                publish(parentPath, {
                    previousValue: parentPreviousValue,
                    value: parentCurrentValue,
                    changedPath: propPath,
                    changedProperty: propPath.substring(parentPath.length + 1),
                    deepChange: true
                }, { 
                    changeToken,
                    isPropagated: true
                });
            }
            
        
            // First, publish the event for the exact property that changed
            // // This is the primary change
            // publish(propPath, {
            //     previousValue,
            //     value,
            // }, { 
            //     changeToken,
            //     isPropagated: false // This is the primary property that changed
            // });
            
            // // Set up data for the parent update
            // const rootPath = parts[0];
            // const rootPrevious = global.get(rootPath);
            
            // // Get a clone of the current full object after the update
            // const rootCurrent = global.get(rootPath);
            
            // // Only publish one event for the root object with details about the nested change
            // // This is a propagated notification
            // publish(rootPath, {
            //     previousValue: rootPrevious,
            //     value: rootCurrent,
            //     changedPath: propPath,
            //     changedProperty: propPath.substring(rootPath.length + 1),
            //     deepChange: true
            // }, { 
            //     changeToken,
            //     isPropagated: true // This is a propagated notification
            // });
            
            // For complex hierarchies where we want intermediate path notifications,
            // uncomment and modify this code:
            /*
            // For each intermediate level in the hierarchy, emit an event
            for (let i = 2; i < parts.length; i++) {
                // Get the parent path at this level
                const parentPath = parts.slice(0, i).join('.');
                
                // Get the parent objects
                const parentPreviousValue = global.get(parentPath);
                const parentCurrentValue = global.get(parentPath);
                
                // Publish the event for this intermediate parent
                publish(parentPath, {
                    previousValue: parentPreviousValue,
                    value: parentCurrentValue,
                    changedPath: propPath,
                    changedProperty: propPath.substring(parentPath.length + 1),
                    deepChange: true
                }, { 
                    changeToken,
                    isPropagated: true
                });
            }
            */
        };

        node.on('input', function(msg, send, done) {
            if (msg.property) {
                property = msg.property;
            }
            
            // Get action from config or msg
            const action = msg.action || config.action || 'replace';

            try {
                const previousValue = global.get(property);

                // Process the user function to get the final value
                let value;
                eval(`value = function() {${config.func}}();`);

                node.status({});

                if (value === undefined) {
                    node.error(`[set-global-state - ${property}] Value is undefined`, msg);
                    node.status({ fill: 'red', shape: 'ring', text: 'error' });
                    if (done) done();
                    return;
                }

                let finalValue = value;
                
                // Handle append action if needed
                if (action === 'append' && previousValue !== undefined) {
                    // Apply different append behaviors based on data type
                    if (Array.isArray(previousValue)) {
                        // For arrays, add items to the end
                        if (Array.isArray(value)) {
                            finalValue = [...previousValue, ...value];
                        } else {
                            // Add single item to array
                            finalValue = [...previousValue, value];
                        }
                    } else if (Buffer.isBuffer(previousValue)) {
                        // For buffers, concatenate them
                        if (Buffer.isBuffer(value)) {
                            finalValue = Buffer.concat([previousValue, value]);
                        } else if (typeof value === 'string') {
                            // If value is a string, convert to buffer and concatenate
                            finalValue = Buffer.concat([previousValue, Buffer.from(value)]);
                        } else {
                            node.error(`Cannot append ${typeof value} to Buffer`, msg);
                            node.status({ fill: 'red', shape: 'ring', text: 'type mismatch' });
                            if (done) done();
                            return;
                        }
                    } else if (typeof previousValue === 'object' && previousValue !== null && typeof value === 'object' && value !== null) {
                        // For objects, merge properties
                        finalValue = merge({}, previousValue, value);
                    } else if (typeof previousValue === 'string') {
                        // For strings, concatenate
                        if (typeof value === 'string') {
                            finalValue = previousValue + value;
                        } else if (Buffer.isBuffer(value)) {
                            // If value is a buffer, convert to string and concatenate
                            finalValue = previousValue + value.toString();
                        } else {
                            node.error(`Cannot append ${typeof value} to string`, msg);
                            node.status({ fill: 'red', shape: 'ring', text: 'type mismatch' });
                            if (done) done();
                            return;
                        }
                    } else if (typeof previousValue === 'number') {
                        // For numbers, add
                        if (typeof value === 'number') {
                            finalValue = previousValue + value;
                        } else {
                            node.error(`Cannot append ${typeof value} to number`, msg);
                            node.status({ fill: 'red', shape: 'ring', text: 'type mismatch' });
                            if (done) done();
                            return;
                        }
                    } else {
                        // Types don't match and can't be appended
                        node.error(`Cannot append to ${typeof previousValue}`, msg);
                        node.status({ fill: 'red', shape: 'ring', text: 'type mismatch' });
                        if (done) done();
                        return;
                    }
                }

                if (isEqual(previousValue, finalValue)) {
                    return;
                }

                // Set the value in global context
                global.set(property, finalValue);

                // Publish events for this property and all parent paths
                publishPropertyAndParents(property, previousValue, finalValue);

                // This call is wrapped in a check that 'done' exists
                // so the node will work in earlier versions of Node-RED (<1.0)
                if (done) {
                    done();
                }
            } catch (error) {
                if (done) {
                    // Node-RED 1.0 compatible
                    done(error);
                } else {
                    // Node-RED 0.x compatible
                    node.error(error, msg);
                }
                console.error(error);
                node.status({ fill: 'red', shape: 'ring', text: 'error' });
            }
        });
    }

    RED.nodes.registerType('set-global-state', SetGlobalState);
}