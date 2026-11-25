import type { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import { initializeApp, getApps, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

const AUTH_APP_NAME = "polyglot-auth-verifier";

let cachedProjectId: string | null = null;

function resolveFirebaseProjectId(): string {
  if (cachedProjectId) return cachedProjectId;

  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (parsed?.projectId) {
        cachedProjectId = String(parsed.projectId);
        return cachedProjectId;
      }
    }
  } catch (err) {
    console.warn("[AuthMiddleware] Could not read firebase-applet-config.json:", err);
  }

  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PROJECT_ID.trim()) {
    cachedProjectId = process.env.FIREBASE_PROJECT_ID.trim();
    return cachedProjectId;
  }

  cachedProjectId = "polyglot-ai-tuto";
  return cachedProjectId;
}

function getAuthVerifierApp(): App {
  const existing = getApps().find((a) => a.name === AUTH_APP_NAME);
  if (existing) return existing;
  return initializeApp({ projectId: resolveFirebaseProjectId() }, AUTH_APP_NAME);
}

export interface VerifiedAuthUser {
  uid: string;
  email?: string;
  name?: string;
}

/**
 * Verifies a Firebase Auth ID token using Firebase Admin (public Google x509 certs, no private credentials needed).
 */
export async function verifyFirebaseIdToken(
  rawToken: string | null | undefined
): Promise<VerifiedAuthUser | null> {
  if (!rawToken || typeof rawToken !== "string") return null;
  const token = rawToken.replace(/^Bearer\s+/i, "").trim();
  if (token.length < 20) return null;

  try {
    const decoded: DecodedIdToken = await getAuth(getAuthVerifierApp()).verifyIdToken(token);
    if (!decoded?.uid) return null;
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name,
    };
  } catch (err: any) {
    console.warn("[AuthMiddleware] Token verification failed:", err?.code || err?.message || err);
    return null;
  }
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return null;
}

/**
 * Express middleware that requires a valid Firebase Google sign-in token
 * before any endpoint using a Gemini API Key (BYOK or Server key) can execute.
 */
export async function requireFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = extractBearerToken(req);
  const user = await verifyFirebaseIdToken(token);
  if (!user) {
    return res.status(401).json({
      authRequired: true,
      error: "กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้งานฟีเจอร์ AI และ API Key (BYOK)",
      message: "กรุณาเข้าสู่ระบบด้วยบัญชี Google ก่อนใช้งานฟีเจอร์ AI และ API Key (BYOK)",
    });
  }
  (req as any).authUser = user;
  next();
}
