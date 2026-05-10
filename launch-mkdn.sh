#!/bin/bash
source ~/.bashrc 2>/dev/null
export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$HOME/.cargo/bin:$PATH"
cd /home/nkk/git/mkdn

# Check current commit before pull
OLD_HEAD=$(git rev-parse HEAD 2>/dev/null)
git pull --ff-only 2>/dev/null
NEW_HEAD=$(git rev-parse HEAD 2>/dev/null)

# Only rebuild if remote changed or binary doesn't exist
BINARY=/home/nkk/git/mkdn/src-tauri/target/release/mkdn
if [ "$OLD_HEAD" != "$NEW_HEAD" ] || [ ! -f "$BINARY" ]; then
  zenity --progress --title="MKDN" --text="Updating MKDN..." \
      --pulsate --no-cancel --width=300 \
      --window-icon=/home/nkk/git/mkdn/src-tauri/icons/128x128.png 2>/dev/null &
  ZENITY_PID=$!

  npx tauri build --no-bundle > /tmp/mkdn-build.log 2>&1
  BUILD_EXIT=$?

  kill $ZENITY_PID 2>/dev/null
  wait $ZENITY_PID 2>/dev/null

  if [ $BUILD_EXIT -ne 0 ]; then
    zenity --error --title="MKDN" --text="Build failed. Check /tmp/mkdn-build.log for details." --width=300 \
      --window-icon=/home/nkk/git/mkdn/src-tauri/icons/128x128.png 2>/dev/null
    exit 1
  fi
fi

# Force X11 backend to get native window decorations on GNOME/Wayland
export GDK_BACKEND=x11
exec "$BINARY"
