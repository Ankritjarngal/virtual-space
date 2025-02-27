import { createWorker } from "./worker.js";
import { createWebRtcTransport } from "./createWebrtcTransport.js";
import { WebSocket } from "ws";

let mediasoupRouter;
let producerTransport;
let consumerTransport;
const producers = []; // Array to hold remote producers for consumption
let consumer; // For a single consumer (for testing)

const Websocketconnection = async (websock) => {
  try {
    mediasoupRouter = await createWorker();
    console.log("Mediasoup Router created successfully");
  } catch (error) {
    console.error("Error creating mediasoup worker:", error);
  }

  websock.on('connection', (ws) => {
    console.log("New WebSocket connection established");
    
    ws.on('message', async (message) => {  
      console.log("Received message:", message.toString());
      
      try {
        if (!IsJsonString(message)) {
          console.error("Error: Invalid JSON");
          return;
        }

        const event = JSON.parse(message);
        if (!event.type) {
          console.error("Error: Missing event type");
          return;
        }

        switch (event.type) {
          case 'getRouterRtpCapabilities':
            await getRouterRtpCapabilities(ws);
            break;
          case 'createProduderTransport':
            await createProducerTransport(ws);
            break;
          case 'connectProduderTransport':
            await connectProducerTransport(event, ws);
            break;
          case 'produce':
            await produceMedia(event, ws, websock);
            break;
          case 'createConsumerTransport':
            await createConsumerTransport(ws);
            break;
          case 'connectConsumerTransport':
            await connectConsumerTransport(event, ws);
            break;
          case 'consume':
            await consumeMedia(event, ws);
            break;
          case 'resume':
            await resume(event, ws);
            break;
          default:
            console.log("Unknown event type:", event.type);
            break;
        }
      } catch (error) {
        console.error("Error processing message:", error);
        send(ws, "error", { message: "Server error processing message" });
      }
    });

    ws.on('close', () => {
      console.log("WebSocket connection closed");
    });

    ws.on('error', (error) => {
      console.error("WebSocket error:", error);
    });
  });
};

const getRouterRtpCapabilities = async (ws) => {
  if (!mediasoupRouter) {
    send(ws, "error", { message: "Router not initialized" });
    return;
  }
  console.log("Sending router capabilities");
  send(ws, "routerCapilities", mediasoupRouter.rtpCapabilities);
};

const createProducerTransport = async (ws) => {
  try {
    const { transport, params } = await createWebRtcTransport(mediasoupRouter);
    producerTransport = transport;
    console.log("Producer transport created with id:", transport.id);
    send(ws, "producerTransport", params);
  } catch (error) {
    console.error("Error creating producer transport:", error);
    send(ws, "error", { message: "Failed to create producer transport" });
  }
};

const connectProducerTransport = async (event, ws) => {
  try {
    if (!producerTransport) {
      send(ws, "error", { message: "No producer transport" });
      return;
    }
    await producerTransport.connect({
      dtlsParameters: event.data.dtlsParameters
    });
    console.log("Producer transport connected");
    send(ws, "producerConnected", 'Producer connected');
  } catch (error) {
    console.error("Error connecting producer transport:", error);
    send(ws, "error", { message: "Failed to connect producer transport" });
  }
};

const produceMedia = async (event, ws, websock) => {
  try {
    if (!producerTransport) {
      send(ws, "error", { message: "No producer transport" });
      return;
    }
    const { kind, rtpParameters } = event.data;
    // Only audio is supported.
    const producer = await producerTransport.produce({
      kind,
      rtpParameters
    });
    
    // Save this producer for later consumption by other clients.
    producers.push({ id: producer.id, producer });
    console.log(`Producer created with id: ${producer.id}`);
    send(ws, "produce", { id: producer.id });
    // Broadcast new producer event to all clients
    broadcast(websock, 'newProducer', { id: producer.id });
  } catch (error) {
    console.error("Error producing media:", error);
    send(ws, "error", { message: "Failed to produce" });
  }
};

// Consumer functions

const createConsumerTransport = async (ws) => {
  try {
    const { transport, params } = await createWebRtcTransport(mediasoupRouter);
    consumerTransport = transport;
    console.log("Consumer transport created with id:", consumerTransport.id);
    send(ws, "subTransportCreated", params);
  } catch (error) {
    console.error("Error creating consumer transport:", error);
    send(ws, "error", { message: "Failed to create consumer transport" });
  }
};

const connectConsumerTransport = async (event, ws) => {
  try {
    if (!consumerTransport) {
      send(ws, "error", { message: "No consumer transport" });
      return;
    }
    await consumerTransport.connect({ dtlsParameters: event.data.dtlsParameters });
    console.log("Consumer transport connected");
    send(ws, "subConnected", 'Consumer transport connected');
  } catch (error) {
    console.error("Error connecting consumer transport:", error);
    send(ws, "error", { message: "Failed to connect consumer transport" });
  }
};

const consumeMedia = async (event, ws) => {
  try {
    const { remoteProducerId, rtpCapabilities } = event.data;
    if (!remoteProducerId) {
      send(ws, "error", { message: "Missing remoteProducerId" });
      return;
    }
    const res = await createConsumer(remoteProducerId, rtpCapabilities);
    console.log("Consumer created:", res);
    send(ws, "subscribed", res);
  } catch (error) {
    console.error("Error consuming media:", error);
    send(ws, "error", { message: "Failed to consume" });
  }
};

const resume = async (event, ws) => {
  try {
    if (!consumer) {
      send(ws, "error", { message: "No consumer to resume" });
      return;
    }
    await consumer.resume();
    console.log("Consumer resumed");
    send(ws, "resumed", 'Consumer resumed');
  } catch (error) {
    console.error("Error resuming consumer:", error);
    send(ws, "error", { message: "Failed to resume consumer" });
  }
};

const createConsumer = async (remoteProducerId, rtpCapabilities) => {
  const remoteProducerObj = producers.find(p => p.id === remoteProducerId);
  if (!remoteProducerObj) {
    console.error("Remote producer not found");
    return null;
  }
  if (!mediasoupRouter.canConsume({ producerId: remoteProducerObj.id, rtpCapabilities })) {
    console.error("Cannot consume remote producer");
    return null;
  }
  try {
    consumer = await consumerTransport.consume({
      producerId: remoteProducerObj.id,
      rtpCapabilities,
      paused: true // start paused; client will resume later
    });
    return {
      producerId: remoteProducerObj.id,
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused,
    };
  } catch (err) {
    console.error("Error creating consumer:", err);
    return null;
  }
};

const IsJsonString = (str) => {
  try {
    JSON.parse(str);
    return true;
  } catch (error) {
    return false;
  }
};

const send = (ws, type, data) => {
  try {
    ws.send(JSON.stringify({ type, data }));
    console.log(`Sent message: ${type}`, data);
  } catch (error) {
    console.error("Error sending message:", error);
  }
};

const broadcast = (websock, type, data) => {
  try {
    const message = JSON.stringify({ type, data });
    websock.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    console.log(`Broadcast message: ${type}`, data);
  } catch (error) {
    console.error("Error broadcasting message:", error);
  }
};

export { Websocketconnection };
