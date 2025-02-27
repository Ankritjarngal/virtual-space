import React, { useState, useEffect, useRef } from 'react';
import * as mediasoupClient from 'mediasoup-client';
import './App.css';

function App() {
  const [isConnected, setIsConnected] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [statusMessage, setStatusMessage] = useState('Disconnected');
  const [audioLevel, setAudioLevel] = useState(0);
  
  // Refs for transports, device, and WebSocket
  const wsRef = useRef(null);
  const deviceRef = useRef(null);
  const producerTransportRef = useRef(null);
  const consumerTransportRef = useRef(null);
  const producerRef = useRef(null);
  const audioContextRef = useRef(null);

  // Connect to backend signaling server (port 8000)
  const connectToServer = () => {
    setStatusMessage('Connecting to server...');
    const serverUrl = 'ws://localhost:8000/ws';
    const ws = new WebSocket(serverUrl);
    
    ws.onopen = () => {
      setIsConnected(true);
      setStatusMessage('Connected to server');
      wsRef.current = ws;
    };
    
    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received message:', message);
        await handleSignalingMessage(message);
      } catch (error) {
        console.error('Error handling message:', error);
        setStatusMessage('Error processing message from server');
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setStatusMessage('Connection error');
    };
    
    ws.onclose = () => {
      setIsConnected(false);
      setStatusMessage('Disconnected from server');
      if (isCallActive) {
        endCall();
      }
    };
  };

  // Handle signaling messages from server
  const handleSignalingMessage = async (message) => {
    const { type, data } = message;
    
    switch (type) {
      case 'routerCapilities':
        await loadDevice(data);
        break;
      case 'producerTransport':
        await handleProducerTransport(data);
        break;
      case 'producerConnected':
        await produceAudio();
        break;
      case 'produce':
        handleProduceSuccess(data);
        break;
      case 'subTransportCreated':
        await handleConsumerTransport(data);
        break;
      case 'subConnected':
        console.log('Consumer transport connected');
        break;
      case 'subscribed':
        await handleConsumeSuccess(data);
        break;
      case 'newProducer':
        // When a new producer is announced, if it's not your own, initiate consumption.
        if (data && data.id && data.id !== (producerRef.current ? producerRef.current.id : null)) {
          // If no consumer transport exists, request one.
          if (!consumerTransportRef.current) {
            createConsumerTransport();
          }
          // Delay briefly to ensure the consumer transport is ready.
          setTimeout(() => {
            sendMessage('consume', { remoteProducerId: data.id, rtpCapabilities: deviceRef.current.rtpCapabilities });
          }, 500);
        }
        break;
      case 'error':
        setStatusMessage(`Error: ${data.message}`);
        break;
      default:
        console.log('Unknown message type:', type);
    }
  };

  // Load mediasoup device with router capabilities from server
  const loadDevice = async (routerRtpCapabilities) => {
    try {
      setStatusMessage('Initializing connection...');
      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities });
      deviceRef.current = device;
      // Request producer transport creation
      sendMessage('createProduderTransport');
      setStatusMessage('Connection initialized');
    } catch (error) {
      console.error('Error loading device:', error);
      setStatusMessage('Failed to initialize connection');
    }
  };

  // Handle creation of producer transport
  const handleProducerTransport = async (transportParams) => {
    try {
      const { id, iceParameters, iceCandidates, dtlsParameters } = transportParams;
      const transport = deviceRef.current.createSendTransport({
        id,
        iceParameters,
        iceCandidates,
        dtlsParameters
      });
      
      transport.on('connect', ({ dtlsParameters }, callback) => {
        sendMessage('connectProduderTransport', { dtlsParameters });
        callback();
      });
      
      transport.on('produce', ({ kind, rtpParameters }, callback) => {
        sendMessage('produce', { kind, rtpParameters });
        callback({ id: 'pending' });
      });
      
      producerTransportRef.current = transport;
    } catch (error) {
      console.error('Error creating producer transport:', error);
      setStatusMessage('Failed to establish connection');
    }
  };

  // Handle successful produce response
  const handleProduceSuccess = (data) => {
    const { id } = data;
    if (producerRef.current) {
      producerRef.current.id = id;
    }
    setIsCallActive(true);
    setStatusMessage('Call active - producing audio');
  };

  // Handle consumer transport creation response
  const handleConsumerTransport = async (transportParams) => {
    try {
      const transport = deviceRef.current.createRecvTransport(transportParams);
      transport.on('connect', ({ dtlsParameters }, callback) => {
        sendMessage('connectConsumerTransport', { dtlsParameters });
        callback();
      });
      consumerTransportRef.current = transport;
    } catch (error) {
      console.error('Error handling consumer transport:', error);
    }
  };

  // Handle consumer creation (when server sends "subscribed")
  const handleConsumeSuccess = async (consumerParams) => {
    try {
      const consumer = await consumerTransportRef.current.consume({
        producerId: consumerParams.producerId,
        id: consumerParams.id,
        kind: consumerParams.kind,
        rtpParameters: consumerParams.rtpParameters
      });
      // After creating the consumer, request to resume it.
      sendMessage('resume', {});
      attachConsumerTrack(consumer.track);
    } catch (error) {
      console.error('Error handling consume success:', error);
    }
  };

  // Utility: Attach remote audio track to an <audio> element.
  const attachConsumerTrack = (track) => {
    let audio = document.getElementById('remoteAudio');
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = 'remoteAudio';
      audio.autoplay = true;
      document.body.appendChild(audio);
    }
    const stream = new MediaStream();
    stream.addTrack(track);
    audio.srcObject = stream;
  };

  // Utility: Send messages via WebSocket.
  const sendMessage = (type, data = {}) => {
    if (!wsRef.current) return;
    wsRef.current.send(JSON.stringify({ type, data }));
  };

  // Create consumer transport by sending request to server.
  const createConsumerTransport = () => {
    sendMessage('createConsumerTransport');
  };

  // Start the call: get local audio, then request router capabilities.
  const startCall = async () => {
    try {
      setStatusMessage('Getting media permissions...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      setLocalStream(stream);
      startAudioLevelMonitoring(stream);
      sendMessage('getRouterRtpCapabilities');
      setStatusMessage('Establishing call...');
    } catch (error) {
      console.error('Error getting user media:', error);
      setStatusMessage('Failed to get audio: ' + error.message);
    }
  };

  // Produce local audio.
  const produceAudio = async () => {
    if (!producerTransportRef.current || !localStream) return;
    try {
      const track = localStream.getAudioTracks()[0];
      const producer = await producerTransportRef.current.produce({
        track,
        codecOptions: {
          opusStereo: true,
          opusDtx: true,
          opusFec: true,
          opusPtime: 20,
          opusMaxPlaybackRate: 48000
        }
      });
      producerRef.current = producer;
      producer.on('transportclose', () => console.log('Producer transport closed'));
      producer.on('trackended', () => { console.log('Track ended'); endCall(); });
    } catch (error) {
      console.error('Error producing audio:', error);
      setStatusMessage('Failed to produce audio');
    }
  };

  // Monitor local audio level.
  const startAudioLevelMonitoring = (stream) => {
    if (!stream) return;
    try {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioContextRef.current = audioContext;
      const analyser = audioContext.createAnalyser();
      const microphone = audioContext.createMediaStreamSource(stream);
      analyser.smoothingTimeConstant = 0.8;
      analyser.fftSize = 1024;
      microphone.connect(analyser);
      const checkAudioLevel = () => {
        const array = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(array);
        let values = 0;
        for (let i = 0; i < array.length; i++) {
          values += array[i];
        }
        setAudioLevel(values / array.length);
        requestAnimationFrame(checkAudioLevel);
      };
      requestAnimationFrame(checkAudioLevel);
    } catch (error) {
      console.error('Error setting up audio monitoring:', error);
    }
  };

  // End call: close streams, transports, and reset state.
  const endCall = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (producerRef.current) {
      producerRef.current.close();
      producerRef.current = null;
    }
    if (producerTransportRef.current) {
      producerTransportRef.current.close();
      producerTransportRef.current = null;
    }
    if (consumerTransportRef.current) {
      consumerTransportRef.current.close();
      consumerTransportRef.current = null;
    }
    setIsCallActive(false);
    setStatusMessage('Call ended');
    setAudioLevel(0);
  };

  useEffect(() => {
    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="app-container">
      <h1>MediaSoup Audio Call</h1>
      <div className="status-display">
        <p>Status: {statusMessage}</p>
      </div>
      <div className="controls">
        {!isConnected ? (
          <button className="connect-button" onClick={connectToServer}>
            Connect to Server
          </button>
        ) : !isCallActive ? (
          <button className="call-button" onClick={startCall}>
            Start Audio Call
          </button>
        ) : (
          <button className="end-button" onClick={endCall}>
            End Call
          </button>
        )}
      </div>
      {isCallActive && (
        <div className="call-active">
          <div className="audio-level-container">
            <div className="audio-level-label">Your Audio Level:</div>
            <div className="audio-level-indicator">
              <div 
                className="audio-level" 
                style={{ width: `${Math.min(audioLevel * 3, 100)}%` }}
              ></div>
            </div>
          </div>
          <p>Audio call in progress</p>
        </div>
      )}
    </div>
  );
}

export default App;
