#!/bin/bash
while true; do
  COUNT=$(npx tsx check_progress2.ts | grep -o '[0-9]*')
  echo "Remaining: $COUNT"
  if [ "$COUNT" -eq 0 ]; then
    echo "Done translating!"
    break
  fi
  sleep 10
done
npm run build
