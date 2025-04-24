# node-red-context-pubsub

This project features publish and subscribe nodes for global context. It is especially useful for state management through global context, providing a [tag browser style](https://www.docs.inductiveautomation.com/docs/8.1/platform/tags/tag-browser) interface for your node-red project and aggregating your applications data and events into a local [unified namespace](https://www.iiot.university/blog/what-is-uns%3F).

This project was orignally inspired by [node-red-contrib-context-hook](https://flows.nodered.org/node/@siirimangus/node-red-contrib-context-hook) but is a near complete re-write, with a different underlying pub/sub engine and providing many more features.

**Note: This package should be considered in beta stage. It has been tested in nominal cases but not in production. Use with care. Expect issues**

## Installation

Either use the Manage Palette option in the Node-RED menu, run the following command in your Node-RED user directory, or add it to your Dockerfile

```
npm install --production --save @bveenema/node-red-context-hook
```

Omit the `--production` flag, in order to install the development dependencies for testing and coverage. Omit `--save` if you don't want to add it to your package.json.

## Usage
`Context Pub/Sub` provides two simple nodes, publish-context and subscribe-context. They can be used very basically and expanded on as your application develops.

### publish-context
This node stores data in Node-Reds global context. After the value is set, it triggers any `subscribe-context` nodes that are listening, causing them to trigger their flow.

Publish Context has the following inputs:
- Name - Name of the node
- Property - Name of the property to store the value in global context. Can use dot notation to update at sepecific point in global context (ex: "model.view.valveTable)
- Action - Replace or Append
- Value - a function to process the incoming msg object and return whatever should be published to property

**IMPORTANT!** In order for the subscribe-context node to work, global context must be updated using this Node! Any context updated outside this node will NOT trigger subscribing nodes, but will update global context

### subscribe-context
This node listens for changes in the global context that are updated by the `publish-context` node. When the subscribed global context changes, the triggers a message with the following format
```json
{
    "payload": {type: any}, // the new value - the type will be that of the subscribed value stored in global context
    "previousValue": {type: any}, // the previous value - the type will be that of the subscribed value stored in global context
    "changedPaths": {type: array}, // the full path to all the properties in the payload that changed
    "changedProperties": {type: array}, // the properties in the payload that changed
    "subscribedPattern": {type: string}, // the matched pattern of the subscriber
}
```

Subscribe supports
- subscriptions of any depth (ie, publishes to `model.view.valveTable` will trigger subscriptions to `model` and `model.view`)
- multiple subscriptions per node, with each subscription resulting in a separate message triggering a flow
- dynamic subscriptions using:
  - Wildcards (`model.view.*Table` or `model.*Valve.currentValue.value`)
  - Regex (`model\.[^.]*Valve\.(current|target)State\.value$` *the value of either the currentState or targetState of any key ending in "Valve" in model*)
  - JSONata (`model.**[type="Valve"]` *any key in model that has a subkey "type" of value "Valve", ie - all "Valve" type objects in model*)

**Note: Dynamic Subscriptions use considerably more processing power than standard subscriptions. Care should be taken in their deployment**


## Example Flows
Several example flows are included to demonstrate different features:
- `examples/basic.json` - Basic usage of set and subscribe
- `examples/deep-subscribe.json` - Deep property subscriptions
- `examples/multi-subscribe.json` - Multi value subscriptions
- `examples/dynamic-subscribe.json` - Working with dynamic property updates
- `examples/append-publish.json` - Appending to the global context instead of Replacing
- `examples/stress-test.json` - A simple stress test that triggers multiple dynamic subscriptions frequently

## Contribution

To setup your local development environment first clone this repository, then use a container runtime to get your node-red environment up and running.

Using Podman:
```bash
podman run -p 1880:1880 -v $(pwd):/data/node_modules/@bveenema/node-red-context-hook -d --name node-red-context-hook nodered/node-red
```

Or using Docker:
```bash
# For Linux/Mac:
docker run -p 1880:1880 -v "$(pwd)":/data/node_modules/@bveenema/node-red-context-hook -d --name node-red-context-hook nodered/node-red

# For Windows PowerShell:
docker run -p 1880:1880 -v ${PWD}:/data/node_modules/@bveenema/node-red-context-hook -d --name node-red-context-hook nodered/node-red
```

After you saved your changes to the code update the installation within the container with this command:

For Podman:
```bash
podman exec -it node-red-context-hook npm install /data/node_modules/@bveenema/node-red-context-hook/ && podman restart node-red-context-hook
```

For Docker:
```bash
# For Linux/Mac:
docker exec -it node-red-context-hook npm install /data/node_modules/@bveenema/node-red-context-hook/ && docker restart node-red-context-hook

# For Windows PowerShell:
docker exec -it node-red-context-hook npm install /data/node_modules/@bveenema/node-red-context-hook/; docker restart node-red-context-hook 
```

## Roadmap
- Build JSONata and Regex testing environments