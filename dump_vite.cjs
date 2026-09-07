const WebSocket = require('./node_modules/ws');
const ws = new WebSocket('ws://127.0.0.1:9229/eb48f8d6-285f-4a62-9180-2197b862582e');
ws.on('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `
        let res = "not found";
        if (typeof globalThis.__vite_dev_server__ !== 'undefined') {
          const graph = Array.from(globalThis.__vite_dev_server__.moduleGraph.urlToModuleMap.entries());
          for(const [url, mod] of graph) {
            if (url.includes('hsk7to9Data')) {
              // Try to dump the original file content or module info
              res = require('fs').readFileSync(mod.file, 'utf8').substring(0, 500); 
            }
          }
        }
        res;
      `,
      returnByValue: true
    }
  }));
});
ws.on('message', (msg) => {
  const data = JSON.parse(msg);
  if (data.id === 1) {
    if(data.result && data.result.result) {
      console.log(data.result.result.value);
    } else {
      console.log("Failed:", data);
    }
    process.exit(0);
  }
});
