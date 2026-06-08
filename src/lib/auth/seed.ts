/**
 * v0.18-AUTH · 管理员账户 seed（幂等）
 *
 * 启动时 + login 兜底时都会调。确保存在 admin 账户：
 *   username = admin
 *   password = 672229（用户指定）
 *   role     = admin
 *
 * 已存在则不动（不会覆盖用户后来改过的密码）。
 */
import "server-only";
import { prisma } from "@/lib/db";
import { hashPassword } from "./core";

const ADMIN_USERNAME = "admin";
const ADMIN_DEFAULT_PASSWORD = "672229";

let seeded = false;

export async function ensureAdminSeed(): Promise<void> {
  if (seeded) return;
  try {
    const existing = await prisma.user.findUnique({
      where: { username: ADMIN_USERNAME },
    });
    if (existing) {
      seeded = true;
      return;
    }
    const passHash = await hashPassword(ADMIN_DEFAULT_PASSWORD);
    await prisma.user.create({
      data: {
        username: ADMIN_USERNAME,
        passHash,
        role: "admin",
        active: true,
      },
    });
    seeded = true;
  } catch {
    // 表还没建好等情况 — 不缓存，下次再试
  }
}
