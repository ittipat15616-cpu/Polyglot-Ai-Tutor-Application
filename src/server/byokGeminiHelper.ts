import { GoogleGenAI, ThinkingLevel } from "@google/genai";

/**
 * Free-Tier-verified BYOK model profiles based on Google AI Studio Free Tier rate limits:
 * - hydrogen   : 20 RPD / 5 RPM / 250K TPM  (Mock Test AI grading, Video Subtitles)
 * - flash38    : 20 RPD / 5 RPM / 250K TPM  (Karaoke new song translation)
 * - flash36    : 20 RPD / 5 RPM / 250K TPM  (Custom Reading article analysis)
 * - flash_lite : 500 + 500 = 1,000 RPD / 15 RPM / 250K TPM
 *                (Vocab Exam, Karaoke Word Explain, Roleplay Custom Mission,
 *                 Roleplay Report Card, Post-call Tutor Memory Summary)
 *
 * Strictly NEVER calls 0/0/0 Pro/Paid models on customer BYOK keys.
 */
export type ByokModelProfile = "hydrogen" | "flash38" | "flash36" | "flash_lite";

export const BYOK_MODEL_CHAINS: Record<ByokModelProfile, readonly string[]> = {
  hydrogen: [
    "gemini-4-hydrogen",
    "gemini-3.6-flash",
    "gemini-3-flash-preview",
    "gemini-3-flash",
    "gemini-2.5-flash",
    "gemini-flash-latest",
  ],
  flash38: [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3-flash-preview",
    "gemini-3-flash",
    "gemini-2.5-flash",
    "gemini-flash-latest",
  ],
  flash36: [
    "gemini-3.6-flash",
    "gemini-3.8-flash",
    "gemini-3-flash-preview",
    "gemini-3-flash",
    "gemini-2.5-flash",
    "gemini-flash-latest",
  ],
  flash_lite: [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash-lite-preview",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-flash-latest",
  ],
};

/** Default validation chain: starts with high-RPD Flash Lite models so validating never wastes 20-RPD Flash buckets */
export const BYOK_FLASH_MODEL_CHAIN = BYOK_MODEL_CHAINS.flash_lite;

export const SERVER_FLASH_MODEL_CHAIN = [
  "gemini-4-hydrogen",
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
] as const;

export const LIVE_PRIMARY_MODEL = "gemini-3.8-live";
export const LIVE_TPM_FALLBACK_MODELS = [
  "gemini-3-flash-live",
  "gemini-3-flash-live-preview",
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-2.5-flash-native-audio-preview-09-2025",
] as const;

export class ByokQuotaExhaustedError extends Error {
  public readonly status = 429;
  public readonly byokQuotaExhausted = true;

  constructor(message = "Google API Key ส่วนตัวของคุณใช้งานครบโควตาชั่วคราวแล้ว (429)") {
    super(message);
    this.name = "ByokQuotaExhaustedError";
  }
}

export class ByokInvalidKeyError extends Error {
  public readonly status = 400;
  public readonly byokInvalidKey = true;

  constructor(
    message = "API Key ส่วนตัว (BYOK) ไม่ถูกต้อง หมดอายุ หรือถูกยกเลิกแล้ว กรุณาตรวจสอบคีย์ในหน้าตั้งค่า BYOK หรือสลับใช้เครดิตในแอป"
  ) {
    super(message);
    this.name = "ByokInvalidKeyError";
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
    msg.includes("too many requests") ||
    msg.includes("tokens per minute") ||
    msg.includes("tpm")
  );
}

export function isModelNotFoundOrUnsupportedError(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  const status = err?.status || err?.statusCode;
  return (
    status === 404 ||
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("is not found") ||
    msg.includes("is not supported") ||
    msg.includes("does not support") ||
    msg.includes("unsupported model") ||
    msg.includes("model not available") ||
    msg.includes("thinking")
  );
}

/**
 * Returns true ONLY when Google explicitly reports that the API key itself is invalid/expired/suspended.
 * Model-level 404 or model-specific access restrictions MUST NOT trigger this, so the fallback chain can proceed.
 */
export function isInvalidKeyError(err: any): boolean {
  const msg = String(err?.message || err || "");
  const lower = msg.toLowerCase();
  const status = err?.status || err?.statusCode;

  if (
    msg.includes("API_KEY_INVALID") ||
    lower.includes("api key not valid") ||
    lower.includes("invalid api key") ||
    lower.includes("api key expired") ||
    lower.includes("api key has been disabled") ||
    lower.includes("consumer_suspended") ||
    status === 401
  ) {
    return true;
  }

  // Only treat 403 as invalid key when it is NOT a model-specific access error
  if (
    (status === 403 || lower.includes("permission_denied")) &&
    !lower.includes("model") &&
    !lower.includes("not found")
  ) {
    return true;
  }

  return false;
}

/**
 * Clean GoogleGenAI client for customer BYOK keys (no custom User-Agent override so it behaves identically to /api/validate-key).
 */
export function createClientFromKey(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
  });
}

/**
 * Gemini Live API (BidiGenerateContent) client for customer BYOK keys.
 * Explicitly sets apiVersion (defaults to 'v1beta') because @google/genai 3.x defaults to 'v1',
 * which does not expose the BidiGenerateContent Live WebSocket endpoint (404).
 */
export function createLiveClientFromKey(
  apiKey: string,
  apiVersion: "v1beta" | "v1alpha" = "v1beta"
): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      apiVersion,
    },
  });
}

/**
 * Resilient JSON parser for Gemini text responses.
 * Safely strips markdown code fences and extracts the outermost JSON object or array if stray prose surrounds it.
 */
export function safeParseGeminiJson<T = any>(rawText: string, fallback?: T): T {
  const cleaned = String(rawText || "")
    .replace(/^\uFEFF/, "")
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  if (!cleaned) {
    if (fallback !== undefined) return fallback;
    throw new Error("Empty JSON response from AI");
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Try extracting the outermost JSON object or array
    const firstObj = cleaned.indexOf("{");
    const lastObj = cleaned.lastIndexOf("}");
    const firstArr = cleaned.indexOf("[");
    const lastArr = cleaned.lastIndexOf("]");

    const candidates: string[] = [];
    if (firstArr !== -1 && lastArr > firstArr) {
      if (firstObj === -1 || firstArr < firstObj) {
        candidates.push(cleaned.slice(firstArr, lastArr + 1));
      }
    }
    if (firstObj !== -1 && lastObj > firstObj) {
      candidates.push(cleaned.slice(firstObj, lastObj + 1));
    }
    if (firstArr !== -1 && lastArr > firstArr && firstObj !== -1 && firstArr > firstObj) {
      candidates.push(cleaned.slice(firstArr, lastArr + 1));
    }

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as T;
      } catch {
        // try next candidate
      }
    }

    if (fallback !== undefined) return fallback;
    throw new Error("AI ส่งข้อมูลรูปแบบ JSON ไม่สมบูรณ์ กรุณาลองใหม่อีกครั้ง");
  }
}

export interface GenerateWithFallbackOptions {
  contents: any;
  config?: Record<string, any>;
  useByokQuota?: boolean;
  byokKey?: string | null;
  byokProfile?: ByokModelProfile;
  /**
   * When true, strictly forbids touching the owner's server API key even if byokKey is missing or fails.
   * Note: Whenever useByokQuota === true, server fallback is ALSO strictly forbidden automatically.
   */
  strictByokOnly?: boolean;
  serverDefaultModel?: string;
  serverThinkingLevel?: ThinkingLevel;
  getServerClient?: () => GoogleGenAI;
}

/**
 * Executes a Gemini generateContent call with strict cost isolation:
 * - When useByokQuota === true OR strictByokOnly === true:
 *   STRICTLY uses ONLY the customer's BYOK key on the chosen Free-Tier model profile.
 *   NEVER falls back to the owner's paid server API key under any circumstance (0 Baht owner cost guaranteed).
 * - Otherwise (only for credit-paid requests):
 *   Uses the owner's server API key with serverDefaultModel + SERVER_FLASH_MODEL_CHAIN.
 */
export async function generateContentWithByokFallback(
  opts: GenerateWithFallbackOptions
): Promise<{ text: string; usedByok: boolean; modelUsed: string }> {
  const mustUseByokOnly = Boolean(opts.useByokQuota || opts.strictByokOnly);
  const cleanByok =
    typeof opts.byokKey === "string" && opts.byokKey.trim().length > 15
      ? opts.byokKey.trim()
      : null;

  if (mustUseByokOnly) {
    if (!cleanByok) {
      throw new ByokInvalidKeyError(
        "ไม่พบ Gemini API Key ส่วนตัว (BYOK) กรุณาตั้งค่าคีย์ฟรีในหน้า BYOK ก่อนใช้งาน"
      );
    }

    const ai = createClientFromKey(cleanByok);
    const profile: ByokModelProfile = opts.byokProfile || "flash_lite";
    const chain = BYOK_MODEL_CHAINS[profile];
    let lastError: any = null;
    let sawQuotaError = false;

    for (const model of chain) {
      const cfg: Record<string, any> = { ...(opts.config || {}) };
      // Only apply ThinkingLevel.LOW to gemini-4-hydrogen; strip for all other Free-Tier models
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
        if (isInvalidKeyError(err)) {
          console.warn(`[BYOK:${profile}] Invalid API key detected on ${model}: ${err?.message || err}`);
          throw new ByokInvalidKeyError();
        }
        if (isQuotaOrRateLimitError(err)) {
          sawQuotaError = true;
          console.warn(`[BYOK:${profile}] Model ${model} hit quota/429, trying next model...`);
          continue;
        }
        if (isModelNotFoundOrUnsupportedError(err)) {
          console.warn(`[BYOK:${profile}] Model ${model} not found/unsupported, trying next...`);
          continue;
        }
        console.warn(`[BYOK:${profile}] Model ${model} failed (${err?.message || err}), trying next...`);
        continue;
      }
    }

    if (sawQuotaError) {
      throw new ByokQuotaExhaustedError();
    }
    throw lastError || new Error("ไม่สามารถเชื่อมต่อ Gemini API ด้วยคีย์ส่วนตัว (BYOK) ได้ชั่วคราว");
  }

  // Server-paid path (ONLY reached when credit-paid or explicitly authorized server operation)
  if (!opts.getServerClient) {
    throw new Error("Server AI client is not permitted for this endpoint");
  }

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
