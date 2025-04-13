const { isEqual, cloneDeep } = require('lodash');
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

            try {
                const previousValue = global.get(property);

                let value;
                eval(`value = function() {${config.func}}();`);

                node.status({});

                if (value === undefined) {
                    return;
                }

                if (isEqual(previousValue, value)) {
                    return;
                }

                // For leaf properties, simply set the value
                if (!property.includes('.')) {
                    global.set(property, value);
                }

                // Emit events for this property and any parent paths
                emitPropertyAndParents(property, previousValue, value);

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