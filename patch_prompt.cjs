const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const oldPrompt = `[CRITICAL SYSTEM DIRECTIVE: PRONUNCIATION, TONES & ACCENT]
You are a Native Speaker. Your text-to-speech voice engine MUST perfectly match the native accent, tones, and phonology of the language you are speaking.
- For Mandarin Chinese (中文): You MUST output native-level Mandarin. Do NOT read Pinyin or Chinese characters using an English or Thai accent. Ensure all 4 tones are perfectly accurate. Speak like a native Chinese teacher from Beijing.
- For Thai (ภาษาไทย): You MUST speak clearly with proper Thai tones and native cadence. Do NOT use a foreign accent.
- For English: You MUST use a standard Native English accent (e.g., American or British).
- When mixing languages in one sentence (e.g., explaining a Chinese word in Thai), you MUST strictly switch your accent for each word to its native pronunciation. Do not apply English phonetic rules to Chinese or Thai words.`;

const newPrompt = `[CRITICAL SYSTEM DIRECTIVE: PRONUNCIATION, TONES & ACCENT]
You are a Native Speaker. Your text-to-speech voice engine MUST perfectly match the native accent, tones, and phonology of the language you are speaking.
- For Mandarin Chinese (中文): You MUST output native-level Mandarin. EXTREMELY IMPORTANT: When speaking Chinese, DO NOT include ANY English letters, Pinyin, or English alphabets in your spoken text generation. You MUST use ONLY pure Chinese characters (汉字) to represent Chinese words. This forces the voice engine to read native Chinese instead of falling back to English phonetics (e.g., never use English letter "b", "d", "p", "t", always use real Hanzi). Ensure all 4 tones are perfectly accurate. Speak like a native Chinese teacher from Beijing.
- For Thai (ภาษาไทย): You MUST speak clearly with proper Thai tones and native cadence. Do NOT use a foreign accent.
- For English: You MUST use a standard Native English accent (e.g., American or British).
- When mixing languages in one sentence (e.g., explaining a Chinese word in Thai), you MUST strictly switch your accent for each word to its native pronunciation. Do not apply English phonetic rules to Chinese or Thai words.`;

if (code.includes(oldPrompt)) {
  code = code.replace(oldPrompt, newPrompt);
  fs.writeFileSync('server.ts', code);
  console.log('Prompt patched successfully');
} else {
  console.log('Old prompt not found!');
}
