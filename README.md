# node-red-context-hook

A [Node-RED](https://nodered.org/) extension for global context state management. This project features publish and subscribe nodes that allow you to subscribe to global context. It uses nodejs events module to emit events when global context changes instead of building complex, tightly coupled flows with `switch` and `function` nodes. This allows for better state management in Node Red projects
- Deep Subscribe: subscriptions to a high level object will be notified if any key within the object is updated
- Multi-Subscribe: subscribe nodes can specify more than 1 state and will recieve a notification when any of them change.

## Installation

Either use the Manage Palette option in the Node-RED menu or run the following command in your Node-RED user directory

```
npm install --production --save @bveenema/node-red-context-hook
```

Omit the `--production` flag, in order to install the development dependencies for testing and coverage. Omit `--save` if you don't want to add it to your package.json.

## Usage
This extension is interacts with global context for state management.

### set-global-state
This node is used to set values to the global context. After the value is set, an event is emitted to the system
that the other nodes `subscribe-state` and `state-hook` can listen to.

As an example, there is a simple flow to set kitchen temperature. The function in the `set-global-state` node extracts
the temperature value from the message payload and sets it to the global context with the property name `kitchen.temperature`.
If the function returns `undefined`, the value is not updated and no event is emitted.

**IMPORTANT!** In order for the subscribe and hook nodes to work, global context must be updated using this Node! Any context updated with this node will NOT trigger an event for the subscribe and hook nodes

### subscribe-state
This is a node that is used for listening to changes in the global context that are saved by the `set-global-state` node.
If there has been a change in the context value, the node will forward the information about the change in the following format:

```
{
    property,
    previousValue,
    value,
    payload: value
}   
```

As an example, let's listen to the kitchen temperature changes that were set in the previous `set-global-state` node example.
First, add the `subscribe-state` node to the flow and configure it to listen to the property `kitchen.temperature`,
and then debug the message that is sent after kitchen temperature change is saved to the global context.

### state-hook
A function node that provides a hook called `useGlobal`.
This hook can be utilized to watch changes in the global context that were saved via `set-global-state` node.
The `useGlobal` function takes in two parameters: property name from the global context and the default value for it.
The second parameter is optional and is `null` by default. For example, to watch changes in the `kitchen.temperature` value,
the `useGlobal` function should be used like this:

```
const temperature = useGlobal('kitchen.temperature');
```

The `state-hook` node comes in handy when the logic for deciding the next state for an output depends on many
incoming signals. Instead of connecting the signals with `switch`, `function` etc. nodes, all the logic can be handled
within the `state-hook` node.

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

*Note: On SELinux enabled machines it's necessary to allow containers access to your working directory like this: `chcon -t container_file_t $(pwd)`*