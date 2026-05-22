/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 用于 Docker 部署：产出单文件 server，可独立运行
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
