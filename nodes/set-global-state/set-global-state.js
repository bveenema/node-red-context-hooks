const { isEqual, cloneDeep, merge } = require('lodash');
const { getEmitter } = require('../../events/emitter');

module.exports = function(RED) {
    function SetGlobalState(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        let { property } = config;
        const global = node.context().global;

        // Function to emit events for property and all parent paths
        const emitPropertyAndParents = (propPath, previousValue, value) => {
            // Emit for the exact property
            getEmitter().emit(propPath, {
                previousValue,
                value,
            });

            // If this is already a nested property, emit events for parent paths
            if (propPath.includes('.')) {
                const parts = propPath.split('.');
                
                // Get the parent object's full path
                const parentPath = parts[0];
                
                // Get the previous and current full parent objects
                let parentPreviousValue = global.get(parentPath);
                let parentCurrentValue = cloneDeep(parentPreviousValue);
                
                // Apply the change to a copy for the current value
                const leafProperty = parts[parts.length - 1];
                let target = parentCurrentValue;
                
                // Navigate to the right place in the object
                for (let i = 1; i < parts.length - 1; i++) {
                    target = target[parts[i]];
                }
                
                // Update the leaf value
                target[leafProperty] = value;
                
                // Update the global context with the new value
                global.set(parentPath, parentCurrentValue);
                
                // Emit the event for the parent with correct previous and current values,
                // and include information about the nested property that changed
                getEmitter().emit(parentPath, {
                    previousValue: parentPreviousValue,
                    value: parentCurrentValue,
                    changedPath: propPath,
                    changedProperty: propPath.substring(parentPath.length + 1),
                    deepChange: true
                });
            }
        };

        node.on('input', function(msg, send, done) {
            if (msg.property) {
                property = msg.property;
            }
            
            // Get action from config or msg
            const action = msg.action || config.action || 'replace';

            try {
                const previousValue = global.get(property);

                let value;
                eval(`value = function() {${config.func}}();`);

                node.status({});

                if (value === undefined) {
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

                // For leaf properties, simply set the value
                if (!property.includes('.')) {
                    global.set(property, finalValue);
                }

                // Emit events for this property and any parent paths
                emitPropertyAndParents(property, previousValue, finalValue);

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