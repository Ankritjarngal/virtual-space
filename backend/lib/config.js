import { channel } from 'diagnostics_channel';
import os from 'os';

export const config = {
    listrnIp: '0.0.0.0',   // Listen on all network interfaces
    listenPort: 3016,       // Port for signaling server
    mediasoup: {
        numWorker: Object.keys(os.cpus()).length, // Number of Mediasoup workers = CPU cores
        worker: {
            rtcMinPort: 10000,
            rtcMaxPort: 10100,
            logLevel: 'debug',  // Corrected "degub" to "debug"
            logTags: [
                'info',       // General information logs
                'ice',        // ICE (Interactive Connectivity Establishment) logs
                'dtls',       // DTLS (Datagram Transport Layer Security) logs
                'rtp',        // RTP (Real-time Transport Protocol) logs
                'srtp',       // Secure RTP logs
                'rtcp',       // RTCP (Real-time Control Protocol) logs
                'bwe',        // Bandwidth estimation logs
                'score',      // Quality scoring logs
                'simulcast',  // Simulcast logs
                'svc'         // Scalable Video Coding logs
            ] ,
        },
        router:{
            mediaCodes:[{
                kind:'audio',
                mimetype:'audio/opus',
                clockRate:48000,
                channels:2


            }]

        },
        webRtcTransport:{
            listenIp:[
                {
                    ip:'0.0.0.0',
                    annoucedIp:'127.0.0.1'
                }
            ]
        },


        }
    }

