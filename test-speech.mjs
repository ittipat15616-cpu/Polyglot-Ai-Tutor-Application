import 'dotenv/config';
import { GoogleGenAI, Modality } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function test() {
  const session = await ai.live.connect({
    model: "gemini-3.8-live",
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: "Aoede",
          }
        },
        languageCode: "cmn-CN"
      }
    },
    callbacks: {
      onmessage: (msg) => {
        if (msg.serverContent) {
           if (msg.serverContent.outputTranscription) console.log("Output Trans:", msg.serverContent.outputTranscription.text);
        }
      }
    }
  });

  console.log("Connected");
  session.sendRealtimeInput({ text: "Please say 'Hello, how are you' in Chinese." });
  
  setTimeout(() => {
    session.close();
    process.exit(0);
  }, 5000);
}
test();
