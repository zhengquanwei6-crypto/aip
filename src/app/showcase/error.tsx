"use client";

/**
 * /showcase v4 · 客户端错误边界（纸面主题对齐）
 *
 * 当任何 client component 抛未捕获错误时，Next.js 渲染本组件代替默认的
 * "Application error" 兜底页。v4 改造把 v3 的衬线大字 + accent 紫 hover
 * 全部替换为 humanist sans + 1px 黑墨边按钮，跟主页风格保持一致；并把
 * 错误细节静默上报到 `/api/_client-error` 让容器日志可读到。
 */
import { useEffect } from "react";
import Link from "next/link";

export default function ShowcaseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[showcase/error]", error);
    if (typeof window !== "undefined") {
      fetch("/api/_client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "/showcase",
          message: error.message,
          stack: error.stack,
          digest: error.digest,
          ua: navigator.userAgent,
          url: window.location.href,
        }),
      }).catch(() => {});
    }
  }, [error]);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ background: "#faf7f2", color: "#0a0a0a" }}
    >
      <div style={{ maxWidth: "440px", textAlign: "left" }}>
        <div
          className="font-mono"
          style={{
            fontSize: "11.5px",
            color: "#0a0a0a",
            opacity: 0.6,
            marginBottom: "8px",
          }}
        >
          something broke · /showcase
        </div>
        <h1
          style={{
            fontSize: "22px",
            fontWeight: 500,
            lineHeight: 1.4,
            color: "#0a0a0a",
            marginBottom: "12px",
          }}
        >
          页面渲染时出了点小问题
        </h1>
        <p
          style={{
            fontSize: "14px",
            lineHeight: 1.7,
            color: "#0a0a0a",
            opacity: 0.7,
            marginBottom: "20px",
          }}
        >
          错误已经记进容器日志，我会自己排。你可以重试或直接进工作台。
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
          }}
        >
          <button
            type="button"
            onClick={reset}
            style={{
              fontFamily: "inherit",
              fontSize: "13px",
              padding: "6px 14px",
              border: "1px solid #0a0a0a",
              background: "#0a0a0a",
              color: "#faf7f2",
              cursor: "pointer",
              borderRadius: 0,
            }}
          >
            重试
          </button>
          <Link
            href="/dashboard"
            style={{
              fontFamily: "inherit",
              fontSize: "13px",
              padding: "6px 14px",
              border: "1px solid #0a0a0a",
              background: "#faf7f2",
              color: "#0a0a0a",
              textDecoration: "none",
              borderRadius: 0,
            }}
          >
            进入工作台
          </Link>
        </div>
        {error.digest && (
          <div
            className="font-mono"
            style={{
              fontSize: "11.5px",
              color: "#0a0a0a",
              opacity: 0.4,
              marginTop: "16px",
            }}
          >
            digest: {error.digest}
          </div>
        )}
      </div>
    </div>
  );
}
