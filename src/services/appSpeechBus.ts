export interface AppSpeechEvent {
  kind: 'tts-start' | 'tts-end' | 'live-transcript';
  id: string;
  speaker: 'AI' | 'YOU';
  text?: string;
  timestampMs: number;
}

type AppSpeechListener = (event: AppSpeechEvent) => void;

const listeners = new Set<AppSpeechListener>();
let nextId = 1;

export function subscribeAppSpeech(listener: AppSpeechListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitAppTtsStart(text: string): string {
  if (listeners.size === 0) return '';
  const clean = text.trim();
  if (!clean) return '';
  const id = `tts_${nextId++}_${Date.now()}`;
  const event: AppSpeechEvent = {
    kind: 'tts-start',
    id,
    speaker: 'AI',
    text: clean,
    timestampMs: performance.now(),
  };
  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch {
      // ignore listener errors
    }
  });
  return id;
}

export function emitAppTtsEnd(id: string): void {
  if (!id || listeners.size === 0) return;
  const event: AppSpeechEvent = {
    kind: 'tts-end',
    id,
    speaker: 'AI',
    timestampMs: performance.now(),
  };
  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch {
      // ignore listener errors
    }
  });
}

export function emitAppLiveTranscript(role: 'model' | 'user', text: string): void {
  if (listeners.size === 0) return;
  const clean = text.trim();
  if (!clean) return;
  const event: AppSpeechEvent = {
    kind: 'live-transcript',
    id: `live_${nextId++}_${Date.now()}`,
    speaker: role === 'model' ? 'AI' : 'YOU',
    text: clean,
    timestampMs: performance.now(),
  };
  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch {
      // ignore listener errors
    }
  });
}
