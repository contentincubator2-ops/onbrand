#!/bin/bash
# deploy-dev.sh - 启动开发环境服务器 (使用 PM2)
# Usage: ./deploy-dev.sh [start|restart|stop|logs|status]

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目路径
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"

# PM2 应用名称
APP_NAME="ai-talent-dev"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  AI Talent Server - Development Mode${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查 PM2 是否安装
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}错误: PM2 未安装${NC}"
    echo "请运行: npm install -g pm2"
    exit 1
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}警告: .env 文件不存在${NC}"
    echo "请创建 .env 文件并配置必要的环境变量"
    echo ""
    echo "最小配置示例:"
    echo "  PORT=3101"
    echo "  NODE_ENV=development"
    echo "  JWT_SECRET=your-secret-key"
    echo "  DB_HOST=localhost"
    echo "  DB_PORT=3306"
    echo "  DB_USER=root"
    echo "  DB_PASSWORD=your-password"
    echo "  DB_NAME=your-database"
    echo ""
    read -p "是否继续? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 获取命令
COMMAND=${1:-start}

case "$COMMAND" in
    start)
        echo -e "${GREEN}启动开发服务器...${NC}"

        # 确保日志目录存在
        mkdir -p logs

        # 使用 PM2 启动
        pm2 start ecosystem.dev.config.cjs

        # 显示状态
        pm2 status "$APP_NAME"
        echo ""
        echo -e "${GREEN}✓ 服务器已启动${NC}"
        echo -e "  查看日志: ${YELLOW}pm2 logs $APP_NAME${NC}"
        echo -e "  停止服务: ${YELLOW}./deploy-dev.sh stop${NC}"
        echo -e "  重启服务: ${YELLOW}./deploy-dev.sh restart${NC}"
        ;;

    restart)
        echo -e "${YELLOW}重启开发服务器...${NC}"
        pm2 restart "$APP_NAME"
        echo -e "${GREEN}✓ 服务器已重启${NC}"
        pm2 status "$APP_NAME"
        ;;

    stop)
        echo -e "${YELLOW}停止开发服务器...${NC}"
        pm2 stop "$APP_NAME" 2>/dev/null || echo "进程未运行"
        pm2 delete "$APP_NAME" 2>/dev/null || true
        echo -e "${GREEN}✓ 服务器已停止${NC}"
        ;;

    logs)
        echo -e "${BLUE}显示日志 (Ctrl+C 退出):${NC}"
        echo ""
        pm2 logs "$APP_NAME"
        ;;

    status)
        pm2 status "$APP_NAME"
        ;;

    monit)
        echo -e "${BLUE}监控面板 (Ctrl+C 退出):${NC}"
        pm2 monit
        ;;

    *)
        echo "用法: $0 [start|restart|stop|logs|status|monit]"
        echo ""
        echo "命令:"
        echo "  start    - 启动开发服务器"
        echo "  restart  - 重启开发服务器"
        echo "  stop     - 停止开发服务器"
        echo "  logs     - 查看日志"
        echo "  status   - 查看状态"
        echo "  monit    - 打开监控面板"
        exit 1
        ;;
esac

echo ""
