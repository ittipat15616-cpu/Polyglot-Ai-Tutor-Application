
import { getStoredByokKey } from '../services/byokService';

export interface AiGradingResult {
  transcript?: string;
  bandScore: number;
  feedback: string;
  strengths: string[];
  weaknesses: string[];
}

export async function gradeWritingTask(task1: string, task2: string, examId?: string): Promise<AiGradingResult> {
  const prompt = `You are an expert IELTS examiner. Grade the following IELTS Academic Writing responses.
Task 1 Answer:
"${task1 || '(No answer provided)'}"

Task 2 Answer:
"${task2 || '(No answer provided)'}"

Evaluate based on Task Achievement, Coherence and Cohesion, Lexical Resource, and Grammatical Range and Accuracy.
If the exam questions are provided as images, read them to understand the context.
Provide the result strictly in this JSON format (no markdown tags):
{
  "bandScore": 7.0,
  "feedback": "Overall detailed feedback...",
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"]
}`;

  try {
    const byokKey = getStoredByokKey();
    const res = await fetch('/api/grade-writing', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(byokKey ? { 'x-byok-key': byokKey } : {})
      },
      body: JSON.stringify({ prompt, examId, byokKey: byokKey || undefined })
    });
    if (!res.ok) throw new Error('Grading failed');
    return await res.json();
  } catch (err) {
    console.error("AI Grading failed:", err);
    throw err;
  }
}

export async function gradeSpeaking(audioBlobs: Blob[], examId?: string): Promise<AiGradingResult> {
  
  const audioDataPromises = audioBlobs.map(blob => {
    return new Promise<{ base64: string, mimeType: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve({
          base64: (reader.result as string).split(',')[1],
          mimeType: blob.type
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  });

  try {
    const audioDataArray = await Promise.all(audioDataPromises);
    const byokKey = getStoredByokKey();
    const res = await fetch('/api/grade-speaking', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(byokKey ? { 'x-byok-key': byokKey } : {})
      },
      body: JSON.stringify({ audios: audioDataArray, examId, byokKey: byokKey || undefined })
    });
    if (!res.ok) throw new Error('Grading failed');
    return await res.json();
  } catch (err) {
    console.error("AI Grading speaking failed:", err);
    throw err;
  }

}
