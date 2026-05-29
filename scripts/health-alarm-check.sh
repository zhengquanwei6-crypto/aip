#!/bin/bash
# v0.15-j · cron 每 15 分钟跑一次
# 调 /api/health/full → 任何 ok=false 写 /var/log/aip-alarm.log
LOG=/var/log/aip-alarm.log
RES=$(curl -s -m 20 http://127.0.0.1:3000/api/health/full)
TS=$(date '+%Y-%m-%d %H:%M:%S')
OK=$(echo "$RES" | head -c 200 | grep -o '"ok":true' | head -1)
if [ -z "$OK" ]; then
  echo "[$TS] ALARM" >> "$LOG"
  echo "$RES" | head -c 800 >> "$LOG"
  echo >> "$LOG"
fi
# 滚动: 保留最近 1000 行
if [ -f "$LOG" ] && [ "$(wc -l < "$LOG")" -gt 1000 ]; then
  tail -1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
