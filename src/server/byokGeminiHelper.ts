import { GoogleGenAI, ThinkingLevel } from "@google/genai";

export const BYOK_FLASH_MODEL_CHAIN = [
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
  "gemini-3.1-flash-lite",
] as const;

export const SERVER_FLASH_MODEL_CHAIN = [
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
] as const;

export class ByokQuotaExhaustedError extends Error {
  public readonly status = 429;
  public readonly byokQuotaExhausted = true;

  constructor(message = "Google API Key ส่วนตัวของคุณใช้งานครบโควตาชั่วคราวแล้ว (429)") {
    super(message);
    this.name = "ByokQuotaExhaustedError";
  }
}

export function isQuotaOrRateLimitError(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  const status = err?.status || err?.statusCode || err?.code;
  return (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests")
  );
}

export function isModelNotFoundOrUnsupportedError(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  const status = err?.status || err?.statusCode;
  return (
    status === 404 ||
    msg.includes("not found") ||
    msg.includes("is not supported") ||
    msg.includes("does not support") ||
    msg.includes("invalid argument") ||
    msg.includes("thinking")
  );
}

export function createClientFromKey(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

export interface GenerateWithFallbackOptions {
  contents: any;
  config?: Record<string, any>;
  useByokQuota?: boolean;
  byokKey?: string | null;
  serverDefaultModel?: string;
  serverThinkingLevel?: ThinkingLevel;
  getServerClient: () => GoogleGenAI;
}

/**
 * Executes a Gemini generateContent call.
 * - When useByokQuota && valid byokKey: uses user's BYOK key with Free-Tier-safe Flash fallback chain
 *   (gemini-4-hydrogen -> gemini-3.8-flash -> gemini-3.1-flash-lite).
 *   If all models return 429/quota, throws ByokQuotaExhaustedError so the frontend offers credit fallback.
 * - Otherwise: uses the app server's paid key with serverDefaultModel (fallback to SERVER_FLASH_MODEL_CHAIN).
 */
export async function generateContentWithByokFallback(
  opts: GenerateWithFallbackOptions
): Promise<{ text: string; usedByok: boolean; modelUsed: string }> {
  const cleanByok =
    opts.useByokQuota &&
    typeof opts.byokKey === "string" &&
    opts.byokKey.trim().length > 15
      ? opts.byokKey.trim()
      : null;

  if (cleanByok) {
    const ai = createClientFromKey(cleanByok);
    let lastError: any = null;
    let sawQuotaError = false;

    for (const model of BYOK_FLASH_MODEL_CHAIN) {
      const cfg: Record<string, any> = { ...(opts.config || {}) };
      // Only attach LOW thinkingConfig to hydrogen/flash models that support it
      if (model === "gemini-4-hydrogen" && !cfg.thinkingConfig) {
        cfg.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
      } else if (model !== "gemini-4-hydrogen") {
        delete cfg.thinkingConfig;
      }

      try {
        const response = await ai.models.generateContent({
          model,
          contents: opts.contents,
          config: Object.keys(cfg).length > 0 ? cfg : undefined,
        });
        return {
          text: response.text || "",
          usedByok: true,
          modelUsed: model,
        };
      } catch (err: any) {
        lastError = err;
        if (isQuotaOrRateLimitError(err)) {
          sawQuotaError = true;
          console.warn(`[BYOK Fallback] Model ${model} hit quota/429, trying next Flash model...`);
          continue;
        }
        if (isModelNotFoundOrUnsupportedError(err)) {
          console.warn(`[BYOK Fallback] Model ${model} unsupported/not found, trying next...`);
          continue;
        }
        // Auth error (401/403) or network error: fail fast
        const status = err?.status || err?.statusCode;
        if (status === 401 || status === 403 || String(err?.message || "").includes("API_KEY_INVALID")) {
          throw new ByokQuotaExhaustedError("API Key ส่วนตัวไม่ถูกต้องหรือหมดสิทธิ์ใช้งาน กรุณาตรวจสอบคีย์หรือสลับใช้เครดิตในแอป");
        }
        continue;
      }
    }

    if (sawQuotaError) {
      throw new ByokQuotaExhaustedError();
    }
    throw lastError || new Error("ไม่สามารถเชื่อมต่อ Gemini API ด้วยคีย์ส่วนตัวได้");
  }

  // Server-paid path
  const ai = opts.getServerClient();
  const primaryModel = opts.serverDefaultModel || "gemini-4-hydrogen";
  const serverChain = Array.from(new Set([primaryModel, ...SERVER_FLASH_MODEL_CHAIN]));
  let lastServerErr: any = null;

  for (const model of serverChain) {
    const cfg: Record<string, any> = { ...(opts.config || {}) };
    if (model === primaryModel && opts.serverThinkingLevel && !cfg.thinkingConfig) {
      cfg.thinkingConfig = { thinkingLevel: opts.serverThinkingLevel };
    } else if (model !== primaryModel && model !== "gemini-4-hydrogen") {
      delete cfg.thinkingConfig;
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents: opts.contents,
        config: Object.keys(cfg).length > 0 ? cfg : undefined,
      });
      return {
        text: response.text || "",
        usedByok: false,
        modelUsed: model,
      };
    } catch (err: any) {
      lastServerErr = err;
      console.warn(`[Server AI Fallback] Model ${model} failed (${err?.message || err}), trying next...`);
    }
  }

  throw lastServerErr || new Error("ระบบ AI ของเซิร์ฟเวอร์ไม่พร้อมใช้งานชั่วคราว");
}
