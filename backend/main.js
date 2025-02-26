import express from 'express';
import * as http from 'http';
import { WebSocketServer } from 'ws'; 
import { Websocketconnection } from './lib/ws.js';

const main = async () => {
    const app = express();
    const server = http.createServer(app);
    const websocket = new WebSocketServer({ server, path: '/ws' });  
    
    Websocketconnection(websocket);
    
    const port = 8000;
    server.listen(port, () => {
        console.log("running on 8000......");
    });
};

export { main };