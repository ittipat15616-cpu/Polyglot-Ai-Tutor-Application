const fs = require('fs');
let code = fs.readFileSync('index.html', 'utf8');

const errorOverlay = `
    <div id="error-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(255,0,0,0.9); color:white; z-index:999999; padding:20px; box-sizing:border-box; overflow:auto;">
      <h2>Application Error</h2>
      <pre id="error-msg" style="white-space:pre-wrap; word-wrap:break-word;"></pre>
    </div>
    <script>
      window.addEventListener('error', function(e) {
        document.getElementById('error-overlay').style.display = 'block';
        document.getElementById('error-msg').textContent = e.message + '\\n' + e.filename + ':' + e.lineno + '\\n\\n' + (e.error ? e.error.stack : '');
      });
      window.addEventListener('unhandledrejection', function(e) {
        document.getElementById('error-overlay').style.display = 'block';
        document.getElementById('error-msg').textContent = 'Unhandled Rejection: ' + e.reason;
      });
    </script>
`;

if (!code.includes('error-overlay')) {
  code = code.replace('<body>', '<body>' + errorOverlay);
  fs.writeFileSync('index.html', code);
}
