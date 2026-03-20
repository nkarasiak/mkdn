#!/bin/bash
cd /home/nkk/git/mkdn
git pull --ff-only 2>/dev/null
npm run tauri:build 2>&1 | tail -5
exec /home/nkk/git/mkdn/src-tauri/target/release/mkdn
