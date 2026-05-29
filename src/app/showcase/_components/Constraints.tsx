import { SectionHeader } from "./Architecture";

/**
 * v5 · Constraints — paper-surface 不做什么清单。
 *
 * 黑底页面里夹一片米白页，5 条约束以 numbered display headlines 出现，
 * 每条配一句 reason。整体读起来像 "杂志 contract 页"。
 */
const ITEMS = [
  {
    prefix: "不",
    action: "注册账号",
    reason: "所有数据落本地 sqlite，关掉浏览器即丢，不存在中央用户表。",
  },
  {
    prefix: "不",
    action: "做云后端",
    reason: "guodong.ai 单 VPS 跑全栈，无第三方 SaaS 依赖，没有冷启动。",
  },
  {
    prefix: "不",
    action: "在本页放分析脚本",
    reason: "/showcase 页面 0 outbound 第三方请求 (CSP self-only 兜底)。",
  },
  {
    prefix: "仅",
    action: "BYOK",
    reason: "跑你自己的 OpenAI / KIE / CometAPI 密钥，token 走你自己的账单。",
  },
  {
    prefix: "不",
    action: "收集邮箱",
    reason: "不做 newsletter、不做 demo 申请表，没有人会因为你看了这页给你发邮件。",
  },
] as const;

export default function Constraints() {
  return (
    <section
      data-section="constraints"
      data-surface="paper"
      style={{
        padding: "clamp(48px, 8vw, 96px) clamp(16px, 4vw, 64px)",
      }}
    >
      <SectionHeader
        invert
        index="04"
        kicker="CONSTRAINTS"
        title="把不做什么也写下来"
        sub="SaaS 通常把限制条件写在合同附件里、不写在首页。我反着来：你先读这一页，再决定要不要点下面的按钮。"
      />

      <ol
        style={{
          marginTop: "56px",
          listStyle: "none",
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: "0",
        }}
      >
        {ITEMS.map((c, i) => (
          <li
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(56px, 88px) 1fr",
              gap: "24px",
              padding: "28px 0",
              borderTop: "1px solid rgba(10, 10, 10, 0.12)",
              alignItems: "baseline",
            }}
          >
            <div
              className="v5-display"
              style={{
                fontSize: "clamp(36px, 4.5vw, 64px)",
                fontWeight: 900,
                color: "#b08be8",
                letterSpacing: "-0.04em",
                lineHeight: 1,
              }}
            >
              {c.prefix}
            </div>
            <div>
              <div
                style={{
                  fontSize: "clamp(22px, 2.4vw, 32px)",
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.2,
                  color: "#0a0a0a",
                  marginBottom: "8px",
                }}
              >
                {c.action}
              </div>
              <p
                style={{
                  fontSize: "15px",
                  lineHeight: 1.6,
                  color: "rgba(10, 10, 10, 0.7)",
                  margin: 0,
                  maxWidth: "640px",
                }}
              >
                {c.reason}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
