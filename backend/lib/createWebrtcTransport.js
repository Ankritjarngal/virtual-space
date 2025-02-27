import config from './config.js';
import * as mediasoup from 'mediasoup';

export const createWebRtcTransport = async (router) => {
  try {
    const transport = await router.createWebRtcTransport(config.mediasoup.webRtcTransport);
    const params = {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    };
    return { transport, params };
  } catch (error) {
    console.error('Error creating WebRTC transport:', error);
    throw error;
  }
};

export default createWebRtcTransport;
