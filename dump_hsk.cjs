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
              res = mod.transformResult ? mod.transformResult.code : "no transform result";
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
      require('fs').writeFileSync('/tmp/hsk7to9_dump.js', data.result.result.value || JSON.stringify(data.result));
      console.log("Dumped!");
    } else {
      console.log("Failed:", data);
    }
    process.exit(0);
  }
});
