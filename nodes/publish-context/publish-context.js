const { isEqual, uniq, get, cloneDeep, merge } = require('lodash');
const { getNextChangeToken } = require('../../events/track-changes');
const PubSub = require('pubsub-js');

module.exports = function(RED) {
    function SetGlobalState(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        let { property } = config;
        const global = node.context().global;

        // Get all nested keys from an object with their full paths
        const getAllNestedKeys = (obj, prefix = '') => {
            if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
                return [];
            }
            
            let keys = [];
            for (const key of Object.keys(obj)) {
                const currentPath = prefix ? `${prefix}.${key}` : key;
                // Add the current key path
                keys.push(currentPath);
                
                // If value is an object, recurse and get nested keys
                if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
                    keys = keys.concat(getAllNestedKeys(obj[key], currentPath));
                }
            }
            
            return keys;
        }
        
        const getDeepUpdatedKeys = (oldData, newData, prefix = '') => {
            // if newData no supplied, throw an error
            if (!newData) {
                node.error(`[getDeepUpdatedKeys] newData is not supplied`)
                return [];
            }
            
            // If this is a new key, oldData will be of form {keyName: undefined}
            const key = Object.keys(oldData)[0];
            if (oldData && oldData[key] === undefined) {
                return getAllNestedKeys(newData, prefix);
            }
        
            // For regular comparison
            const data = uniq([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
            const keys = [];
            
            for (const key of data) {
                const oldValue = oldData?.[key];
                const newValue = newData?.[key];
                const currentPath = prefix ? `${prefix}.${key}` : key;
                
                // If both values are objects (and not null), check if the object itself has changed
                if (
                    oldValue && 
                    newValue && 
                    typeof oldValue === 'object' && 
                    typeof newValue === 'object' &&
                    !Array.isArray(oldValue) &&
                    !Array.isArray(newValue)
                ) {
                    // First check if the object itself has changed
                    if (!isEqual(oldValue, newValue)) {
                        keys.push(currentPath);
                    }
                    // Then check nested properties
                    const nestedChanges = getDeepUpdatedKeys(oldValue, newValue, currentPath);
                    keys.push(...nestedChanges);
                }
                // If values are different, add the current path
                else if (!isEqual(oldValue, newValue)) {
                    keys.push(currentPath);
                }
            }
            
            return keys;
        }

        const pathToObject = (path, value) => {
            // Split the path into parts
            const parts = path.split('.');
            
            // Start with an empty object
            const result = {};
            
            // Keep track of the current object we're building
            let current = result;
            
            // Process all parts except the last one
            for (let i = 0; i < parts.length - 1; i++) {
                const part = parts[i];
                current[part] = {};
                current = current[part];
            }
            
            // Assign the value to the last part
            current[parts[parts.length - 1]] = value;

            return result;
        }

        const handleAppend = (previousValue, newValue) => {
            // Apply different append behaviors based on data type
            if (Array.isArray(previousValue)) {
                // For arrays, add items to the end
                if (Array.isArray(newValue)) {
                    return [...previousValue, ...newValue];
                } else {
                    // Add single item to array
                    return [...previousValue, newValue];
                }
            } else if (Buffer.isBuffer(previousValue)) {
                // For buffers, concatenate them
                if (Buffer.isBuffer(newValue)) {
                    return Buffer.concat([previousValue, newValue]);
                } else if (typeof newValue === 'string') {
                    // If newValue is a string, convert to buffer and concatenate
                    return Buffer.concat([previousValue, Buffer.from(newValue)]);
                } else {
                    throw new Error(`Cannot append ${typeof newValue} to Buffer`);
                }
            } else if (typeof previousValue === 'object' && previousValue !== null && typeof newValue === 'object' && newValue !== null) {
                // For objects, merge properties
                return merge({}, previousValue, newValue);
            } else if (typeof previousValue === 'string') {
                // For strings, concatenate
                if (typeof newValue === 'string') {
                    return previousValue + newValue;
                } else if (Buffer.isBuffer(newValue)) {
                    // If newValue is a buffer, convert to string and concatenate
                    return previousValue + newValue.toString();
                } else {
                    throw new Error(`Cannot append ${typeof newValue} to string`);
                }
            } else if (typeof previousValue === 'number') {
                // For numbers, add
                if (typeof newValue === 'number') {
                    return previousValue + newValue;
                } else {
                    throw new Error(`Cannot append ${typeof newValue} to number`);
                }
            } else {
                // Types don't match and can't be appended
                throw new Error(`Cannot append to ${typeof previousValue}`);
            }
        }

        node.on('input', function(msg, send, done) {
            if (msg.property) {
                property = msg.property;
            }
            
            // Get action from config or msg
            const action = msg.action || config.action || 'replace';

            try {
                // Process the new value
                let newValue;
                eval(`newValue = function() {${config.func}}();`);

                if (newValue === undefined) {
                    node.error(`[${property}] New value is undefined`, msg);
                    if (done) done();
                    return;
                }
                
                // get the previous value
                const previousValue = global.get(property);

                // handle append
                if (action === 'append' && previousValue !== undefined) {
                    try {
                        newValue = handleAppend(previousValue, newValue);
                    } catch (error) {
                        node.error(`[${property}] Error appending: ${error}`, msg);
                        node.status({ fill: 'red', shape: 'ring', text: 'type mismatch' });
                        if (done) done();
                        return;
                    }
                }
                
                // if the previous value is equal to the new value, then don't do anything
                if (isEqual(previousValue, newValue)) {
                    return;
                }

                const prevObj = pathToObject(property, previousValue);
                const topLevelKey = Object.keys(prevObj)[0];
                const prevFullObj = { [topLevelKey]: cloneDeep(global.get(topLevelKey)) };

                // set the new value
                global.set(property, newValue);

                // Create objects for changed keys calculation
                const finalObj = pathToObject(property, newValue);
                const finalFullObj = { [topLevelKey]: global.get(topLevelKey) };

                // Get all the changed keys
                const changedKeys = getDeepUpdatedKeys(prevObj, finalObj);

                // Generate a single change token for this entire operation
                const changeToken = getNextChangeToken();

                // publish all the changed keys
                changedKeys.forEach(key => {
                    if(PubSub.countSubscriptions(key) > 0) {
                        PubSub.publish(key, {
                            value: get(finalFullObj, key),
                            previousValue: get(prevFullObj, key),
                            changedPaths: changedKeys,
                            pubKey: key,
                            changeToken: changeToken
                        });
                    }
                });

                if (done) {
                    done();
                }
            } catch (error) {
                if (done) {
                    done(error);
                } else {
                    node.error(error, msg);
                }
                node.error(error);
                node.status({ fill: 'red', shape: 'ring', text: 'error processing publish' });
            }
        });
    }

    RED.nodes.registerType('publish-context', SetGlobalState);
}