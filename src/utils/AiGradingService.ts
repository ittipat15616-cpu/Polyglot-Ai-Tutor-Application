import { getFirebaseAuthHeaders } from '../services/authHeaders';

export interface AiGradingResult {
  transcript?: string;
  bandScore: number;
  feedback: string;
  strengths: string[];
  weaknesses: string[];
}

export interface GradingByokOptions {
  useByokQuota?: boolean;
  byokKey?: string | null;
}

export async function gradeWritingTask(
  task1: string,
  task2: string,
  examId?: string,
  byokOpts?: GradingByokOptions
): Promise<AiGradingResult> {
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

  const res = await fetch('/api/grade-writing', {
    method: 'POST',
    headers: await getFirebaseAuthHeaders(),
    body: JSON.stringify({
      prompt,
      examId,
      useByokQuota: Boolean(byokOpts?.useByokQuota),
      byokKey: byokOpts?.byokKey || null,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data.error || 'Grading failed');
    err.status = res.status;
    err.byokInvalidKey = Boolean(data.byokInvalidKey);
    err.authRequired = Boolean(data.authRequired || (res.status === 401 && !data.byokInvalidKey));
    err.byokQuotaExhausted = Boolean(data.byokQuotaExhausted || res.status === 429);
    throw err;
  }
  return data;
}

export async function gradeSpeaking(
  audioBlobs: Blob[],
  examId?: string,
  byokOpts?: GradingByokOptions
): Promise<AiGradingResult> {
  const audioDataPromises = audioBlobs.map((blob) => {
    return new Promise<{ base64: string; mimeType: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve({
          base64: (reader.result as string).split(',')[1],
          mimeType: blob.type,
        });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  });

  const audioDataArray = await Promise.all(audioDataPromises);
  const res = await fetch('/api/grade-speaking', {
    method: 'POST',
    headers: await getFirebaseAuthHeaders(),
    body: JSON.stringify({
      audios: audioDataArray,
      examId,
      useByokQuota: Boolean(byokOpts?.useByokQuota),
      byokKey: byokOpts?.byokKey || null,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err: any = new Error(data.error || 'Grading failed');
    err.status = res.status;
    err.byokInvalidKey = Boolean(data.byokInvalidKey);
    err.authRequired = Boolean(data.authRequired || (res.status === 401 && !data.byokInvalidKey));
    err.byokQuotaExhausted = Boolean(data.byokQuotaExhausted || res.status === 429);
    throw err;
  }
  return data;
}
