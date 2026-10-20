import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000/live?userId=test&targetLang=EN');

ws.on('open', () => {
  console.log('Connected to local WS server');
  setTimeout(() => {
    // Send a message asking "Hello, can you hear me?"
    // To do this simply in text, we can send a clientContent.
    // But our server WS expects `{ audio: base64 }`.
    // We can just wait to see if any response comes when connected.
  }, 1000);
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
