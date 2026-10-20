const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// Replace the Pronunciation directive
const oldPrompt = `[PRONUNCIATION & ACCENT DIRECTIVE - CRITICAL]
คุณคือ Native Speaker อย่างแท้จริง การออกเสียง (Pronunciation) เป็นเรื่องสำคัญสูงสุด!
- เมื่อพูดภาษาจีน (Chinese/Mandarin) คุณต้องปรับโหมดเสียงของคุณให้เป็นสำเนียงจีนแท้ 100% (Native Chinese Accent) ห้ามใช้แกนเสียงภาษาไทยหรือภาษาอังกฤษมาอ่านภาษาจีนเด็ดขาด
- เมื่อพูดภาษาอังกฤษ (English) คุณต้องใช้สำเนียงอเมริกันหรืออังกฤษแท้ 100% ห้ามติดสำเนียงไทยหรือภาษาอื่น
- เมื่อพูดภาษาไทย (Thai) คุณต้องพูดชัดเจนแบบคนไทย 
- ห้ามนำสำเนียงของภาษาหนึ่งไปปะปนกับอีกภาษาหนึ่งเด็ดขาด หากในหนึ่งประโยคมีสองภาษา ให้สลับสำเนียง (Code-switching accent) ให้ถูกต้องตามแต่ละคำทันที`;

const newPrompt = `[CRITICAL SYSTEM DIRECTIVE: PRONUNCIATION, TONES & ACCENT]
You are a Native Speaker. Your text-to-speech voice engine MUST perfectly match the native accent, tones, and phonology of the language you are speaking.
- For Mandarin Chinese (中文): You MUST output native-level Mandarin. Do NOT read Pinyin or Chinese characters using an English or Thai accent. Ensure all 4 tones are perfectly accurate. Speak like a native Chinese teacher from Beijing.
- For Thai (ภาษาไทย): You MUST speak clearly with proper Thai tones and native cadence. Do NOT use a foreign accent.
- For English: You MUST use a standard Native English accent (e.g., American or British).
- When mixing languages in one sentence (e.g., explaining a Chinese word in Thai), you MUST strictly switch your accent for each word to its native pronunciation. Do not apply English phonetic rules to Chinese or Thai words.`;

code = code.replace(oldPrompt, newPrompt);


const configSection = `config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          tools: [{
            functionDeclarations: [`;

const newConfigSection = `config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          outputAudioTranscription: { languageCode: targetLang === 'CN' ? 'zh-CN' : targetLang === 'TH' ? 'th-TH' : 'en-US' },
          inputAudioTranscription: { languageCode: spokenLang === 'Chinese' ? 'zh-CN' : spokenLang === 'Thai' ? 'th-TH' : 'en-US' },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: targetLang === 'CN' ? 'Aoede' : targetLang === 'TH' ? 'Aoede' : 'Puck'
              }
            }
          },
          tools: [{
            functionDeclarations: [`;

code = code.replace(configSection, newConfigSection);

fs.writeFileSync('server.ts', code);
console.log('Patched server.ts');
