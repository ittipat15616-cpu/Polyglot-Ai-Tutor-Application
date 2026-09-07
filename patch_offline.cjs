const fs = require('fs');
let code = fs.readFileSync('src/services/userPersistence.ts', 'utf8');

// Replace all catch (e) { console.error('...', e); }
code = code.replace(/catch \((e|err)(?:\s*:\s*any)?\) \{\s*console\.error\((['`].*?['`]), \1\);\s*\}/g, (match, errVar, msg) => {
  return `catch (${errVar}: any) {
      if (${errVar}?.code !== 'unavailable' && !${errVar}?.message?.includes('offline')) {
        console.error(${msg}, ${errVar});
      }
    }`;
});

fs.writeFileSync('src/services/userPersistence.ts', code);
