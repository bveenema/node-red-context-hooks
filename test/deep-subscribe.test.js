const helper = require('node-red-node-test-helper');
const subscribeStateNode = require('../nodes/subscribe-state/subscribe-state.js');
const setGlobalStateNode = require('../nodes/set-global-state/set-global-state.js');

helper.init(require.resolve('node-red'));

describe('Deep Subscribe Functionality', function () {
    beforeEach(function (done) {
        helper.startServer(done);
    });

    afterEach(function (done) {
        helper.unload();
        helper.stopServer(done);
    });

    it('should receive notifications when nested properties change', function (done) {
        // Create a test flow with a subscribe-state node and two set-global-state nodes
        const flow = [
            // Subscribe node watching the parent property
            { 
                id: 'subscribe1', 
                type: 'subscribe-state', 
                name: 'subscribe parent',
                property: 'testObj',
                wires: [['helperNode1']]
            },
            // Helper node to check results
            { 
                id: 'helperNode1', 
                type: 'helper' 
            },
            // Set node for setting the initial object
            { 
                id: 'setInitial', 
                type: 'set-global-state', 
                name: 'set initial',
                property: 'testObj',
                func: 'return { level1: { level2: "initial value" } };'
            },
            // Set node for updating a nested property
            { 
                id: 'setNested', 
                type: 'set-global-state', 
                name: 'set nested',
                property: 'testObj.level1.level2',
                func: 'return "updated value";'
            }
        ];

        // Message counts to track different stages
        let messageCount = 0;

        helper.load([subscribeStateNode, setGlobalStateNode], flow, function () {
            const subscribeNode = helper.getNode('subscribe1');
            const helperNode = helper.getNode('helperNode1');
            const setInitialNode = helper.getNode('setInitial');
            const setNestedNode = helper.getNode('setNested');

            // Verify messages received by subscribe node
            helperNode.on('input', function (msg) {
                messageCount++;
                
                // First message (setting initial object)
                if (messageCount === 1) {
                    expect(msg.property).toBe('testObj');
                    expect(msg.previousValue).toBeUndefined();
                    expect(msg.value).toEqual({ level1: { level2: "initial value" } });
                    
                    // Trigger the nested property update
                    setNestedNode.receive({});
                }
                
                // Second message (updating nested property)
                if (messageCount === 2) {
                    try {
                        expect(msg.property).toBe('testObj');
                        expect(msg.previousValue).toEqual({ level1: { level2: "initial value" } });
                        expect(msg.value).toEqual({ level1: { level2: "updated value" } });
                        
                        // Verify nested property change information is included
                        expect(msg.deepChange).toBe(true);
                        expect(msg.changedPath).toBe('testObj.level1.level2');
                        expect(msg.changedProperty).toBe('level1.level2');
                        
                        done();
                    } catch(err) {
                        done(err);
                    }
                }
            });

            // Start the test by setting the initial object
            setInitialNode.receive({});
        });
    });
    
    it('should include property path info for nested updates', function (done) {
        // Create a test flow to verify additional info in messages
        const flow = [
            { 
                id: 'subscribe2', 
                type: 'subscribe-state', 
                name: 'subscribe parent',
                property: 'testObj2',
                wires: [['helperNode2']]
            },
            { 
                id: 'helperNode2', 
                type: 'helper' 
            },
            { 
                id: 'setInitial2', 
                type: 'set-global-state', 
                name: 'set initial',
                property: 'testObj2',
                func: 'return { a: 1, b: { c: 2, d: 3 } };'
            },
            { 
                id: 'setNested2', 
                type: 'set-global-state', 
                name: 'set nested',
                property: 'testObj2.b.c',
                func: 'return 42;'
            }
        ];

        let messageCount = 0;

        helper.load([subscribeStateNode, setGlobalStateNode], flow, function () {
            const helperNode = helper.getNode('helperNode2');
            const setInitialNode = helper.getNode('setInitial2');
            const setNestedNode = helper.getNode('setNested2');

            helperNode.on('input', function (msg) {
                messageCount++;
                
                // Skip first message (initial object set)
                if (messageCount === 1) {
                    setNestedNode.receive({});
                    return;
                }
                
                // For second message (nested update)
                if (messageCount === 2) {
                    try {
                        // Verify the object structure includes property path info
                        expect(msg.property).toBe('testObj2');
                        expect(msg.payload).toEqual({ a: 1, b: { c: 42, d: 3 } });
                        expect(msg.value).toEqual({ a: 1, b: { c: 42, d: 3 } });
                        
                        // Ensure both old and new values are correct
                        expect(msg.previousValue).toEqual({ a: 1, b: { c: 2, d: 3 } });
                        
                        // Verify nested property change information
                        expect(msg.deepChange).toBe(true);
                        expect(msg.changedPath).toBe('testObj2.b.c');
                        expect(msg.changedProperty).toBe('b.c');
                        
                        done();
                    } catch(err) {
                        done(err);
                    }
                }
            });

            setInitialNode.receive({});
        });
    });
}); 