/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 用于 Docker 部署：产出单文件 server，可独立运行
  output: 'standalone',
  images: {
    // 收窄到实际使用的图源域名 + 兼容 OpenAI 兼容中转站
    // 旧版 ** 通配会让 /_next/image 被滥用做 SSRF
    remotePatterns: [
      // OpenAI 官方
      { protocol: 'https', hostname: 'oaidalleapiprodscus.blob.core.windows.net' },
      { protocol: 'https', hostname: 'cdn.openai.com' },
      { protocol: 'https', hostname: 'files.openai.com' },
      // 常见兼容中转站（按需保留）
      { protocol: 'https', hostname: '**.aiquickdraw.com' },
      { protocol: 'https', hostname: 'tempfile.aiquickdraw.com' },
      { protocol: 'https', hostname: 'api.kie.ai' },
      { protocol: 'https', hostname: '**.kie.ai' },
      // 通用 CDN
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.cloudfront.net' },
      { protocol: 'https', hostname: '**.cloudflare.com' },
      // 本机 nginx 反代回来的 / 上传图
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
    ],
  },
  eslint: {
    // TODO: build 时跑 lint；现在先保留宽松，等清完旧 warning 再开
    ignoreDuringBuilds: true,
  },
  // 安全响应头
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
