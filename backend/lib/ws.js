import { createWorker } from "./worker.js";
import { WebSocket } from "ws";
let mediasoupRouter;
const Websocketconnection = async (websock) => {
    try{
        mediasoupRouter=await createWorker();
    }
    catch{
        throw error;
    }
    websock.on('connection', (ws) => {
        ws.on('message', (message) => {  // Fixed typo: 'nessagge' -> 'message'
            console.log("message ", message.toString());
            ws.send("hello");
        });
    });
};
export { Websocketconnection };