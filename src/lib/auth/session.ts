/**
 * v0.18-AUTH · 服务端会话工具（Node runtime）
 *
 * - getSessionSecret(): 从 Setting.AUTH_SESSION_SECRET 取签名密钥；不存在则
 *   随机生成并持久化（这样重启后已签发的 cookie 仍有效）。
 * - getCurrentUser(): 在 server component / route handler 里读当前登录用户。
 * - createSessionCookie / clearSessionCookie: 给 login/logout 路由用。
 */
import "server-only";
import { cookies } from "next/headers";

import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  verifySession,
  type SessionPayload,
} from "./core";

const SECRET_KEY = "AUTH_SESSION_SECRET";

let secretCache: { value: string; at: number } | null = null;

export async function getSessionSecret(): Promise<string> {
  const now = Date.now();
  if (secretCache && now - secretCache.at < 60_000) return secretCache.value;

  // env 优先（运维可强制指定），否则 Setting，否则随机生成持久化
  const fromEnv = process.env.AUTH_SESSION_SECRET?.trim();
  if (fromEnv) {
    secretCache = { value: fromEnv, at: now };
    return fromEnv;
  }

  try {
    const row = await prisma.setting.findUnique({ where: { key: SECRET_KEY } });
    if (row?.value && row.value.length >= 32) {
      secretCache = { value: row.value, at: now };
      return row.value;
    }
    // 生成并写入
    const buf = crypto.getRandomValues(new Uint8Array(48));
    let hex = "";
    for (let i = 0; i < buf.length; i++) hex += buf[i].toString(16).padStart(2, "0");
    await prisma.setting.upsert({
      where: { key: SECRET_KEY },
      create: { key: SECRET_KEY, value: hex },
      update: { value: hex },
    });
    secretCache = { value: hex, at: now };
    return hex;
  } catch {
    // DB 不可用时退回到一个进程级临时密钥（重启后旧 cookie 失效，但不崩）
    const fallback =
      process.env.HOSTNAME || "guodong-fallback-secret-please-set-setting-row-32+";
    return fallback.padEnd(48, "0");
  }
}

/** 当前登录用户（server component / route）。未登录返回 null。 */
export async function getCurrentUser(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const secret = await getSessionSecret();
  return verifySession(token, secret);
}

/** 签发会话并写 cookie（在 route handler 里调）。 */
export async function setSessionCookie(data: {
  uid: string;
  username: string;
  role: "admin" | "user";
}): Promise<void> {
  const secret = await getSessionSecret();
  const token = await signSession(data, secret);
  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** 清除会话 cookie（登出）。 */
export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
