const fs = require('fs');
let code = fs.readFileSync('src/main.tsx', 'utf8');

const patch = `
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && event.reason.message.includes('WebSocket closed without opened')) {
    event.preventDefault();
  }
});
`;

if (!code.includes('WebSocket closed without opened')) {
  code = patch + '\n' + code;
  fs.writeFileSync('src/main.tsx', code);
}
