const fs = require('fs');
console.log(fs.readFileSync('src/components/GoodnotesMode.tsx', 'utf8').substring(0, 2000));
