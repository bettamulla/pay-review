/**
 * Read the session out of a Next.js request (server components & route handlers).
 */
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./auth";

export async function getSession(): Promise<SessionPayload | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

export async function requireUser(): Promise<SessionPayload> {
  const s = await getSession();
  if (!s) throw new Error("UNAUTHORIZED");
  return s;
}
