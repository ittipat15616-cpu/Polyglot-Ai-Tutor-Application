const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// Remove the first speechConfig block I injected
const badBlock = `          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: targetLang === 'CN' ? 'Aoede' : targetLang === 'TH' ? 'Aoede' : 'Puck'
              }
            }
          },`;

code = code.replace(badBlock, "");

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

code = code.replace(oldEndBlock, newEndBlock);

fs.writeFileSync('server.ts', code);
console.log('Fixed duplicate speechConfig');
