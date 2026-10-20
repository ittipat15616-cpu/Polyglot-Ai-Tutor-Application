import 'dotenv/config';
import { GoogleGenAI, Modality } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function test() {
  const session = await ai.live.connect({
    model: "gemini-3.8-live",
    config: {
      responseModalities: [Modality.AUDIO],
      outputAudioTranscription: {},
      inputAudioTranscription: {},
    },
    callbacks: {
      onmessage: (msg) => {
        if (msg.serverContent) {
           if (msg.serverContent.inputTranscription) console.log("Input Trans:", msg.serverContent.inputTranscription);
           if (msg.serverContent.outputTranscription) console.log("Output Trans:", msg.serverContent.outputTranscription);
           if (msg.serverContent.interimInputTranscription) console.log("Interim Trans:", msg.serverContent.interimInputTranscription);
        }
      }
    }
  });

  console.log("Connected");
  session.sendRealtimeInput({ text: "Hello! Please reply in 1 short sentence." });
  
  setTimeout(() => {
    session.close();
    process.exit(0);
  }, 5000);
}
test();
