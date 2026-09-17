/**
 * Tiny JWT-based session: email + userId, signed with HS256.
 * No cookies library — we set/clear cookies in the route handlers.
 */
import { SignJWT, jwtVerify } from "jose";
import { config } from "./config";

const encoder = new TextEncoder();
const key = encoder.encode(config.authSecret);

export type SessionPayload = {
  sub: string; // user id
  email: string;
};

export async function signSession(payload: SessionPayload, ttlDays = 14): Promise<string> {
  return await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttlDays}d`)
    .sign(key);
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "pr_session";

export function buildSetCookie(token: string, maxAgeSec = 60 * 60 * 24 * 14): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`;
}

export function buildClearCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
