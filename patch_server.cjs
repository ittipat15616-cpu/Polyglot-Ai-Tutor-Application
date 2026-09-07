const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetStr = `    const spokenLang = url.searchParams.get('spokenLang') || 'Thai';
    const clientId = url.searchParams.get('clientId') || 'defaultClient';`;

const newStr = `    const spokenLang = url.searchParams.get('spokenLang') || 'Thai';
    const clientId = url.searchParams.get('clientId') || 'defaultClient';
    const isSeriousMode = url.searchParams.get('seriousMode') === 'true';`;

code = code.replace(targetStr, newStr);

const targetPersona = `    let personaDetails = \`\${targetLang === 'CN' ? personaBaseCN : personaBaseEN}
    
IMPORTANT INSTRUCTION: The user is learning \${targetLang === 'CN' ? 'Chinese' : 'English'}. However, the user's preferred spoken language for explanations and general communication is \${spokenLang}. You MUST explain concepts, translate words, and communicate with the user primarily in \${spokenLang}, while teaching them \${targetLang === 'CN' ? 'Chinese' : 'English'}.\`;`;

const newPersona = `    let personaDetails = \`\${targetLang === 'CN' ? personaBaseCN : personaBaseEN}\`;
    if (isSeriousMode) {
      personaDetails += \`\n\n[SERIOUS SPEAKING PRACTICE MODE ACTIVATED]
คุณต้องพูดคุยตอบโต้กับผู้เรียนโดยใช้ภาษาเป้าหมาย (\${targetLang === 'CN' ? 'Chinese' : 'English'}) เป็นหลัก และคอยให้คะแนน ประเมินความคืบหน้าตลอดการสนทนา! 
- คุณต้องชี้แนะจุดอ่อนและจุดแข็งของผู้เรียน
- หากผู้เรียนออกเสียงพลาด เพี้ยน หรือพูดผิดแกรมม่า ให้ชี้แจงจุดที่ผิดและบอกรูปประโยคหรือการออกเสียงที่ถูกต้องเสมอ
- ประเมินคะแนนการพูดให้ผู้เรียนฟังบ่อยๆ
- ในโหมดนี้ คุณจะสอนอย่างจริงจังและเข้มงวดมากขึ้นเพื่อเน้นฝึกการพูดและการฟังล้วนๆ!\`;
    } else {
      personaDetails += \`\n\nIMPORTANT INSTRUCTION: The user is learning \${targetLang === 'CN' ? 'Chinese' : 'English'}. However, the user's preferred spoken language for explanations and general communication is \${spokenLang}. You MUST explain concepts, translate words, and communicate with the user primarily in \${spokenLang}, while teaching them \${targetLang === 'CN' ? 'Chinese' : 'English'}.\`;
    }`;

code = code.replace(targetPersona, newPersona);
fs.writeFileSync('server.ts', code);
