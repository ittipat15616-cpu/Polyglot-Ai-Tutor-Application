const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldEndBlock = `          }],
          speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          }
        },`;

const newEndBlock = `          }],
          speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          }
        },`;

// wait let me add it
const target = `          speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName } },
          }`;

const replacement = `          speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName } },
             languageCode: targetLang === 'CN' ? 'zh' : targetLang === 'TH' ? 'th' : 'en'
          }`;

code = code.replace(target, replacement);

fs.writeFileSync('server.ts', code);
console.log('Added languageCode');
