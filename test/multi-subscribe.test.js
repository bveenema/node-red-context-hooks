const helper = require('node-red-node-test-helper');
const subscribeStateNode = require('../nodes/subscribe-state/subscribe-state.js');
const setGlobalStateNode = require('../nodes/set-global-state/set-global-state.js');

helper.init(require.resolve('node-red'));

describe('Multi-Property Subscribe Functionality', function () {
    beforeEach(function (done) {
        helper.startServer(done);
    });

    afterEach(function (done) {
        helper.unload();
        helper.stopServer(done);
    });

    it('should receive notifications for multiple properties', function (done) {
        // Create a test flow with a subscribe-state node watching multiple properties
        const flow = [
            // Subscribe node watching multiple properties
            { 
                id: 'subscribe1', 
                type: 'subscribe-state', 
                name: 'multi-subscribe',
                properties: ['propA', 'propB'],
                wires: [['helperNode1']]
            },
            // Helper node to check results
            { 
                id: 'helperNode1', 
                type: 'helper' 
            },
            // Set nodes for different properties
            { 
                id: 'setA', 
                type: 'set-global-state', 
                name: 'set A',
                property: 'propA',
                func: 'return "value A";'
            },
            { 
                id: 'setB', 
                type: 'set-global-state', 
                name: 'set B',
                property: 'propB',
                func: 'return "value B";'
            }
        ];

        // Message counts to track changes
        let messageCount = 0;
        const receivedProps = [];

        helper.load([subscribeStateNode, setGlobalStateNode], flow, function () {
            const helperNode = helper.getNode('helperNode1');
            const setANode = helper.getNode('setA');
            const setBNode = helper.getNode('setB');

            // Verify messages received by subscribe node
            helperNode.on('input', function (msg) {
                messageCount++;
                receivedProps.push(msg.property);
                
                // After receiving both messages
                if (messageCount === 2) {
                    try {
                        // Check that we received notifications for both properties
                        expect(receivedProps).toContain('propA');
                        expect(receivedProps).toContain('propB');
                        done();
                    } catch(err) {
                        done(err);
                    }
                }
            });

            // Set both properties
            setANode.receive({});
            setBNode.receive({});
        });
    });
    
    it('should support deep subscription for multiple properties', function (done) {
        // Create a test flow for deep property changes
        const flow = [
            { 
                id: 'subscribe2', 
                type: 'subscribe-state', 
                name: 'deep multi-subscribe',
                properties: ['objA', 'objB'],
                wires: [['helperNode2']]
            },
            { 
                id: 'helperNode2', 
                type: 'helper' 
            },
            // Initial object setup
            { 
                id: 'setObjA', 
                type: 'set-global-state', 
                name: 'set objA',
                property: 'objA',
                func: 'return { x: 1 };'
            },
            { 
                id: 'setObjB', 
                type: 'set-global-state', 
                name: 'set objB',
                property: 'objB',
                func: 'return { y: 2 };'
            },
            // Nested property updates
            { 
                id: 'setNestedA', 
                type: 'set-global-state', 
                name: 'set nested A',
                property: 'objA.x',
                func: 'return 100;'
            },
            { 
                id: 'setNestedB', 
                type: 'set-global-state', 
                name: 'set nested B',
                property: 'objB.y',
                func: 'return 200;'
            }
        ];

        let messageCount = 0;
        const deepChanges = [];

        helper.load([subscribeStateNode, setGlobalStateNode], flow, function () {
            const helperNode = helper.getNode('helperNode2');
            const setObjANode = helper.getNode('setObjA');
            const setObjBNode = helper.getNode('setObjB');
            const setNestedANode = helper.getNode('setNestedA');
            const setNestedBNode = helper.getNode('setNestedB');

            helperNode.on('input', function (msg) {
                messageCount++;
                
                // Skip initial object creation (first 2 messages)
                if (messageCount <= 2) {
                    // After setting up both objects, update nested properties
                    if (messageCount === 2) {
                        setTimeout(() => {
                            setNestedANode.receive({});
                            setNestedBNode.receive({});
                        }, 50);
                    }
                    return;
                }
                
                // For nested property updates (messages 3 and 4)
                if (msg.deepChange) {
                    deepChanges.push(msg.changedPath);
                }
                
                // After all 4 messages processed
                if (messageCount === 4) {
                    try {
                        // Check that we received deep change notifications for both properties
                        expect(deepChanges).toContain('objA.x');
                        expect(deepChanges).toContain('objB.y');
                        done();
                    } catch(err) {
                        done(err);
                    }
                }
            });

            // Set up the initial objects
            setObjANode.receive({});
            setObjBNode.receive({});
        });
    });
}); 