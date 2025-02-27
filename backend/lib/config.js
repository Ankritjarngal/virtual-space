import os from 'os';

export const config = {
  listenIp: '0.0.0.0',           // Listen on all network interfaces
  listenPort: 3016,              // Port for mediasoup (internal)
  mediasoup: {
    numWorkers: Object.keys(os.cpus()).length,
    worker: {
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
      logLevel: 'debug',
      logTags: [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp',
        'bwe',
        'score',
        'simulcast',
        'svc'
      ],
    },
    router: {
      // Only audio codec is configured.
      mediaCodecs: [{
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      }]
    },
    webRtcTransport: {
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp: '127.0.0.1'
        }
      ],
      maxIncomingBitrate: 1500000,
      initialAvailableOutgoingBitrate: 1500000,
    },
  }
};

export default config;
