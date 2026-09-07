const fs = require('fs');

const files = ['src/services/subscriptionService.ts', 'src/services/slipVerification.ts'];

for (const file of files) {
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/catch \((e|err)(?:\s*:\s*any)?\) \{\s*console\.error\((['`].*?['`]), \1\);\s*\}/g, (match, errVar, msg) => {
    return `catch (${errVar}: any) {
      if (${errVar}?.code !== 'unavailable' && !${errVar}?.message?.includes('offline')) {
        console.error(${msg}, ${errVar});
      }
    }`;
  });
  fs.writeFileSync(file, code);
}
