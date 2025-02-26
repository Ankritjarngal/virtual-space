import * as mediasoup from 'mediasoup' 
import {config} from './config.js';
const worker=[]
let nextMediasoupWorker=0;
const createWorker=async()=>{
    const worker=await mediasoup.createWorker(
        {
            logLevel:config.mediasoup.worker.logLevel,
            logTags:config.mediasoup.worker.logTags,
            rtcMaxport:config.mediasoup.worker.rtcMaxPort,
            rtcMinport:config.mediasoup.worker.rtcMinPort,



        }
    );
    worker.on('died',()=>{
        console.log('worker died , exiting ...',worker.pid);
        setTimeout(()=>{
            process.exit(1);
        },2000)
    });

}
export {createWorker}
