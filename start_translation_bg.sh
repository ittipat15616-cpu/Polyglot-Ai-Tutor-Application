#!/bin/bash
while true; do
  COUNT=$(npx tsx check_progress2.ts | grep -o '[0-9]*' | tail -1)
  echo "Remaining: $COUNT"
  if [ -z "$COUNT" ] || [ "$COUNT" -eq 0 ]; then
    echo "Translation finished!"
    npm run build
    break
  fi
  npx tsx translate_hsk7to9_resume2.ts
  sleep 5
done
