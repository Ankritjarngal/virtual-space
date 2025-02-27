import * as mediasoup from 'mediasoup';
import { config } from './config.js';

const workers = [];

const createWorker = async () => {
  try {
    const worker = await mediasoup.createWorker({
      logLevel: config.mediasoup.worker.logLevel,
      logTags: config.mediasoup.worker.logTags,
      rtcMaxPort: config.mediasoup.worker.rtcMaxPort,
      rtcMinPort: config.mediasoup.worker.rtcMinPort,
    });

    worker.on('died', () => {
      console.error(`Worker ${worker.pid} died. Exiting...`);
      setTimeout(() => process.exit(1), 2000);
    });

    const mediaCodecs = config.mediasoup.router.mediaCodecs;
    const router = await worker.createRouter({ mediaCodecs });
    workers.push(worker);
    return router;
  } catch (error) {
    console.error('Error creating Mediasoup worker:', error);
    throw error;
  }
};

export { createWorker };
