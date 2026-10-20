import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000/live?userId=test&targetLang=EN');

ws.on('open', () => {
  console.log('Connected to local WS server');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.audio) {
    console.log('Received audio chunk of length:', msg.audio.length);
  } else {
    console.log('Received message:', msg);
  }
});

ws.on('close', (code, reason) => {
  console.log('Disconnected:', code, reason.toString());
});

ws.on('error', (err) => {
  console.error('WS Error:', err);
});

setTimeout(() => {
  ws.close();
  process.exit(0);
}, 5000);
