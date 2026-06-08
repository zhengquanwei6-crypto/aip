/**
 * v0.18-AUTH · 认证核心库（零依赖 · Web Crypto · Edge 兼容）
 *
 * 设计：
 *   - 这是个单租户个人工作台。所有业务数据（任务 / 资产 / AIOutput / 智能体
 *     输出）都归属管理员账户 admin。注册出来的其它账户能登录、能看，但
 *     workspace 是管理员的同一份数据（共享视图）。
 *   - 不引入 next-auth / bcrypt / jose 等任何依赖。密码哈希用 Web Crypto
 *     PBKDF2-SHA256（10 万轮），会话用 HMAC-SHA256 签名的 cookie。两者都
 *     在 Node 20 和 Edge runtime（middleware）里原生可用。
 *
 * 凭据存储：
 *   - 用户存在 prisma `User` 表（id / username / passHash / role / createdAt）。
 *   - 管理员 admin / 672229 在启动 seed 时写入（见 prisma/seed.ts）。
 *   - 会话签名密钥来自 Setting.AUTH_SESSION_SECRET（首次随机生成持久化），
 *     fallback 到 env AUTH_SESSION_SECRET。
 *
 * 会话 cookie 格式（紧凑、可在 Edge 校验）：
 *   base64url(payloadJSON) + "." + base64url(HMAC-SHA256(payloadJSON, secret))
 *   payload = { uid, username, role, iat, exp }
 */

const PBKDF2_ITERS = 100_000;
const PBKDF2_KEYLEN = 32; // bytes
const SESSION_TTL_SEC = 60 * 60 * 24 * 30; // 30 天

export interface SessionPayload {
  uid: string;
  username: string;
  role: "admin" | "user";
  iat: number; // 秒
  exp: number; // 秒
}

// ───────────────────────── base64url 工具（无 Buffer 依赖，Edge 可用） ─────

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/**
 * TS 5 把 `Uint8Array<ArrayBufferLike>` 和 Web Crypto 期望的
 * `BufferSource`（要求 ArrayBuffer 后备）判为不兼容。这里统一复制成一个
 * 纯 ArrayBuffer 返回 —— ArrayBuffer 本身就是合法的 BufferSource，绕开
 * Uint8Array 的泛型方差问题。
 */
function bs(view: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

// ───────────────────────── 密码哈希（PBKDF2-SHA256） ──────────────────────

/**
 * 生成密码哈希字符串：`pbkdf2$<iters>$<saltB64url>$<hashB64url>`
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERS);
  return `pbkdf2$${PBKDF2_ITERS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

/** 校验明文密码是否匹配存储的哈希。常数时间比较。 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  try {
    const parts = stored.split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
    const iters = Number.parseInt(parts[1], 10);
    if (!Number.isFinite(iters) || iters < 1) return false;
    const salt = base64UrlToBytes(parts[2]);
    const expected = base64UrlToBytes(parts[3]);
    const actual = await pbkdf2(password, salt, iters);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function pbkdf2(
  password: string,
  salt: Uint8Array,
  iters: number,
): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    bs(utf8(password)),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: bs(salt), iterations: iters, hash: "SHA-256" },
    keyMaterial,
    PBKDF2_KEYLEN * 8,
  );
  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ───────────────────────── 会话签名（HMAC-SHA256） ───────────────────────

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    bs(utf8(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

/** 签发会话 token（默认 30 天有效）。 */
export async function signSession(
  data: Pick<SessionPayload, "uid" | "username" | "role">,
  secret: string,
  ttlSec: number = SESSION_TTL_SEC,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    ...data,
    iat: now,
    exp: now + ttlSec,
  };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = bytesToBase64Url(utf8(payloadStr));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, bs(utf8(payloadB64)));
  return `${payloadB64}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

/** 校验并解出会话 payload。失败 / 过期返回 null。 */
export async function verifySession(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  try {
    const dot = token.indexOf(".");
    if (dot < 0) return null;
    const payloadB64 = token.slice(0, dot);
    const sigB64 = token.slice(dot + 1);
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      bs(base64UrlToBytes(sigB64)),
      bs(utf8(payloadB64)),
    );
    if (!ok) return null;
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(payloadB64)),
    ) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== "number" || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = "guodong_session";
export const SESSION_MAX_AGE = SESSION_TTL_SEC;

/** 用户名规则：3-32 位，字母数字下划线连字符。 */
export function isValidUsername(u: string): boolean {
  return /^[a-zA-Z0-9_-]{3,32}$/.test(u);
}

/** 密码规则：至少 6 位。 */
export function isValidPassword(p: string): boolean {
  return typeof p === "string" && p.length >= 6 && p.length <= 128;
}
