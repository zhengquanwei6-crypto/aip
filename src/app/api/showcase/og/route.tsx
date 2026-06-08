/**
 * /api/showcase/og · Open Graph 卡片
 *
 * 1200×630 PNG，纸面米白底 + 黑墨字 + 一点 jelly purple 强调。完全用文字
 * 渲染，不引用任何外部图片资产 — 满足 Req 12.3「no raster source」与
 * 全局 0 图片策略。
 *
 * 标题用最近的一段 editorial topic 作为说明文，自动取当月（YYYY-MM）作为
 * 期号；左下角附 1px 黑墨实线分隔与作者署名。
 *
 * Validates: Requirements 12.3
 */

import { ImageResponse } from "next/og";
import { EDITORIAL_ENTRIES } from "@/app/showcase/_data/editorial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WIDTH = 1200;
const HEIGHT = 630;

function currentMonthTag(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET() {
  const monthTag = currentMonthTag();
  const latest =
    EDITORIAL_ENTRIES[EDITORIAL_ENTRIES.length - 1]?.topic ??
    "纸面工程笔记";
  const subhead = "single-author multi-agent workstation · single VPS in sgp1";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#faf7f2",
          color: "#0a0a0a",
          display: "flex",
          flexDirection: "column",
          padding: "72px 80px",
          fontFamily: '"Inter", "Source Han Sans SC", sans-serif',
        }}
      >
        {/* top kicker */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: "22px",
            fontFamily: '"JetBrains Mono", monospace',
            color: "#0a0a0a",
          }}
        >
          <span>guodong.ai · field notes</span>
          <span style={{ opacity: 0.6 }}>{monthTag}</span>
        </div>

        {/* divider */}
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "1px",
            background: "#0a0a0a",
            marginTop: "32px",
            marginBottom: "60px",
          }}
        />

        {/* main topic */}
        <div
          style={{
            display: "flex",
            fontSize: "60px",
            fontWeight: 500,
            lineHeight: 1.25,
            color: "#0a0a0a",
            marginBottom: "32px",
            maxWidth: "1040px",
          }}
        >
          {latest}
        </div>

        {/* sub-head */}
        <div
          style={{
            display: "flex",
            fontSize: "24px",
            color: "#0a0a0a",
            opacity: 0.65,
            marginBottom: "auto",
            maxWidth: "960px",
          }}
        >
          {subhead}
        </div>

        {/* footer line */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            fontSize: "20px",
            fontFamily: '"JetBrains Mono", monospace',
            color: "#0a0a0a",
            opacity: 0.7,
            paddingTop: "32px",
            borderTop: "1px solid #0a0a0a",
          }}
        >
          <span>www.ojly.top/showcase</span>
          <span style={{ color: "#b08be8" }}>· cuiqd · sgp1</span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
    },
  );
}
