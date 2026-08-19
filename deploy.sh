#!/usr/bin/env bash
# اسکریپت آپدیت سرور: آخرین کد رو از گیت‌هاب می‌گیره، فقط در صورت نیاز
# نصب/بیلد می‌کنه، و بک‌اند رو با pm2 ری‌استارت می‌کنه.
#
# استفاده (از داخل پوشهٔ پروژه روی سرور):
#   ./deploy.sh

set -euo pipefail
cd "$(dirname "$0")"

echo "== بررسی تغییرات محلی روی سرور =="
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  روی سرور تغییرات commit‌نشده وجود داره:"
  git status --short
  echo ""
  echo "قبل از ادامه یکی از این‌ها رو بزن:"
  echo "  git checkout .     (دور ریختن تغییرات محلی)"
  echo "  git stash          (نگه‌داشتن موقت تغییرات محلی)"
  exit 1
fi

echo "== دریافت آخرین نسخه از گیت‌هاب =="
before=$(git rev-parse HEAD)
git pull origin master
after=$(git rev-parse HEAD)

if [ "$before" == "$after" ]; then
  echo "چیز جدیدی برای آپدیت نبود — همه‌چیز از قبل به‌روزه."
  exit 0
fi

echo ""
echo "فایل‌های تغییرکرده بین $before و $after:"
changed=$(git diff --name-only "$before" "$after")
echo "$changed"
echo ""

if echo "$changed" | grep -q "^server/package.json"; then
  echo "== package.json بک‌اند عوض شده → نصب پکیج‌ها =="
  (cd server && npm install)
fi

if echo "$changed" | grep -qE "^web/"; then
  echo "== فرانت تغییر کرده → نصب و بیلد =="
  (cd web && npm install && npm run build)
else
  echo "فرانت تغییر نکرده — بیلد رد شد."
fi

echo "== ری‌استارت بک‌اند (pm2) =="
pm2 restart madar

echo ""
echo "✅ آپدیت با موفقیت انجام شد: $before → $after"
