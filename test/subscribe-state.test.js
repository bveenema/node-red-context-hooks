const helper = require('node-red-node-test-helper');
const subscribeStateNode = require('../nodes/subscribe-context/subscribe-context.js');

helper.init(require.resolve('node-red'));

describe('subscribe-context Node', function () {
    beforeEach(function (done) {
        helper.startServer(done);
    });

    afterEach(function (done) {
        helper.unload();
        helper.stopServer(done);
    });

    it('should be loaded', function (done) {
        const flow = [{ id: 'n1', type: 'subscribe-context', name: 'test name' }];
        helper.load(subscribeStateNode, flow, function () {
            const node = helper.getNode('n1');

            try {
                expect(node).toHaveProperty('name', 'test name');
                done();
            } catch(err) {
                done(err);
            }
        });
    });
});