#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  print '请先安装 Node.js 18 或更新版本，再打开此文件。'
  read -r '?按回车退出'
  exit 1
fi
export HOST=127.0.0.1
export PORT="${PORT:-3000}"
export OPEN_BROWSER=1
print '正在启动本地播放器。关闭此窗口或按 Control+C 可停止服务。'
exec node server.js
