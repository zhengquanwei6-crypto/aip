#!/usr/bin/env bash
# =============================================================
# design-ai-ops · VPS Docker 一键部署脚本（Ubuntu / Debian）
#
# 用法：
#   curl -fsSL https://raw.githubusercontent.com/zhengquanwei6-crypto/aip/main/deploy/install.sh | sudo bash
# 或：
#   sudo bash deploy/install.sh
#
# 该脚本会：
#   1) 安装 Docker / Compose（如果没装）
#   2) 把代码克隆到 /opt/design-ai-ops
#   3) 让你输入 LLM_API_KEY / IMAGE_API_KEY（可留空）
#   4) docker compose up -d
#
# 不做的事（请手动）：
#   * Nginx 配置（模板见 deploy/nginx/）
#   * SSL 证书（用 certbot）
# =============================================================

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/zhengquanwei6-crypto/aip.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/design-ai-ops}"

c() { printf "\033[1;36m%s\033[0m\n" "$*"; }
g() { printf "\033[1;32m%s\033[0m\n" "$*"; }
r() { printf "\033[1;31m%s\033[0m\n" "$*"; }

require_root() {
  if [ "$(id -u)" != "0" ]; then
    r "请使用 sudo 或 root 用户运行本脚本。"
    exit 1
  fi
}

install_docker_if_missing() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    g "[ok] Docker 已安装"
    return
  fi
  c "[1/4] 安装 Docker ..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
}

clone_or_pull_repo() {
  if [ -d "$INSTALL_DIR/.git" ]; then
    c "[2/4] 拉取最新代码 ..."
    git -C "$INSTALL_DIR" fetch --all
    git -C "$INSTALL_DIR" checkout "$REPO_BRANCH"
    git -C "$INSTALL_DIR" pull --ff-only
  else
    c "[2/4] 克隆代码到 $INSTALL_DIR ..."
    git clone --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
  fi
}

setup_env() {
  cd "$INSTALL_DIR"
  if [ -f ".env" ]; then
    g "[ok] .env 已存在，跳过初始化（如需修改请手动编辑 $INSTALL_DIR/.env）"
    return
  fi
  c "[3/4] 写入 .env（API Key 可以留空，启动后在 /settings 页面填）"
  read -r -p "LLM_API_BASE_URL [https://api.openai.com/v1]: " LLM_BASE
  read -r -p "LLM_API_KEY (回车跳过): " LLM_KEY
  read -r -p "LLM_MODEL [gpt-4o-mini]: " LLM_MODEL
  read -r -p "IMAGE_API_BASE_URL [https://api.openai.com/v1]: " IMG_BASE
  read -r -p "IMAGE_API_KEY (回车跳过): " IMG_KEY
  read -r -p "IMAGE_MODEL [gpt-img-2]: " IMG_MODEL

  cat > .env <<EOF
LLM_API_BASE_URL=${LLM_BASE:-https://api.openai.com/v1}
LLM_API_KEY=${LLM_KEY:-}
LLM_MODEL=${LLM_MODEL:-gpt-4o-mini}
IMAGE_API_BASE_URL=${IMG_BASE:-https://api.openai.com/v1}
IMAGE_API_KEY=${IMG_KEY:-}
IMAGE_MODEL=${IMG_MODEL:-gpt-img-2}
EOF
  chmod 600 .env
}

build_and_start() {
  cd "$INSTALL_DIR"
  c "[4/4] 构建并启动容器 ..."
  docker compose build
  docker compose up -d
}

print_summary() {
  echo ""
  g "==================================================="
  g " 🎉 design-ai-ops 已启动"
  g "==================================================="
  echo " 容器状态：    docker compose -f $INSTALL_DIR/docker-compose.yml ps"
  echo " 查看日志：    docker compose -f $INSTALL_DIR/docker-compose.yml logs -f"
  echo " 监听地址：    127.0.0.1:3000（仅本机）"
  echo ""
  echo " 下一步配置 Nginx 反代："
  echo "   1) sudo apt install -y nginx"
  echo "   2) sudo cp $INSTALL_DIR/deploy/nginx/design-ai-ops.conf /etc/nginx/sites-available/"
  echo "   3) 修改文件中的 your-domain.com 为你的域名"
  echo "   4) sudo ln -s /etc/nginx/sites-available/design-ai-ops.conf /etc/nginx/sites-enabled/"
  echo "   5) sudo nginx -t && sudo systemctl reload nginx"
  echo ""
  echo " 申请 SSL 证书（推荐）："
  echo "   sudo apt install -y certbot python3-certbot-nginx"
  echo "   sudo certbot --nginx -d your-domain.com"
  echo ""
  echo " 强烈建议加 Basic Auth（个人工具，避免被扫）："
  echo "   sudo apt install -y apache2-utils"
  echo "   sudo htpasswd -c /etc/nginx/.htpasswd-aip your-username"
  echo "   然后取消 Nginx 配置里的 auth_basic 注释"
  echo ""
}

main() {
  require_root
  install_docker_if_missing
  clone_or_pull_repo
  setup_env
  build_and_start
  print_summary
}

main "$@"
