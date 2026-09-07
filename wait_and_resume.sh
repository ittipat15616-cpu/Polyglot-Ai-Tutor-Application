#!/bin/bash
while true; do
  if npm ls tsx >/dev/null 2>&1; then
    echo "Dependencies ready, resuming translation..."
    npx tsx translate_hsk7to9_resume2.ts
    break
  fi
  sleep 5
done
