const strip = require('strip-comments');

const { subscribe } = require('../../events/emitter.js');

module.exports = function(RED) {
    function StateHook(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const global = node.context().global;

        const code = strip(config.func);
        const subscriptions = []; // Store subscription objects instead of property names

        let timer;

        const runCode = () => {
            clearTimeout(timer);

            timer = setTimeout(() => {
                try {
                    let fn;

                    eval(`fn = (async function () {${code}});`);

                    fn()
                        .then(msg => {
                            if (msg) {
                                node.send(msg);
                            }
                            node.status({});
                        })
                        .catch(error => {
                            console.error(error);
                            node.status({ fill: 'red', shape: 'ring', text: 'error' });
                        });
                } catch (error) {
                    console.error(error);
                    node.status({ fill: 'red', shape: 'ring', text: 'error' });
                }
            }, 1); // run code max once per 1ms
        }

        const useGlobal = (property, defaultValue = null) => {
            // Check if we're already subscribed to this property
            const existingSubscription = subscriptions.find(sub => sub.property === property);
            
            if (!existingSubscription) {
                // Create new subscription using the subscription registry
                const subscription = subscribe(property, () => {
                    runCode();
                });
                
                // Store property with subscription for tracking
                subscriptions.push({
                    property,
                    subscription
                });
            }

            // Get the current value from global context
            let stateValue = global.get(property);

            if (undefined === stateValue || null === stateValue) {
                stateValue = defaultValue;
            }

            return stateValue;
        };

        // Define on global object for use in function code
        this.context().global.set('_useGlobal', useGlobal);

        node.on('close', () => {
            // Unsubscribe from all properties
            subscriptions.forEach(sub => sub.subscription.unsubscribe());
            subscriptions.length = 0; // Clear array
        });

        // Initial run after a short delay
        setTimeout(runCode, 2000 + Math.random() * 2000);
    }

    RED.nodes.registerType('state-hook', StateHook);
};