#!/usr/bin/env bash
# tools/import-model.sh — install a downloaded 3D person into the resort.
#
#   tools/import-model.sh <downloaded file (.glb, .gltf or .fbx)> <name> [simplify ratio]
#
# Example:
#   tools/import-model.sh ~/Downloads/indian_man_in_kurta.glb indian-man-in-kurta
#
# The <name> must match a file in CONFIG.people (config.js), e.g. indian-man-in-kurta
# → assets/people/indian-man-in-kurta.glb. The model must be rigged (Mixamo-style
# skeleton). Unrigged models: upload to https://www.mixamo.com, let it auto-rig, then
# download "FBX Binary, With Skin, T-pose" and pass that .fbx here.
#
# What it does: converts FBX → glTF, reduces the triangle count (default keeps 50 %),
# resizes textures to 1024 px WebP, quantizes the mesh, makes a low-detail copy in
# assets/people/lod/ (used for people far away), and adds both to
# assets/people/index.json so the game loads them. Needs Node.js (uses npx).
set -euo pipefail
IN="${1:?usage: tools/import-model.sh <file> <name> [ratio]}"
NAME="${2:?give the name from CONFIG.people, e.g. indian-man-in-kurta}"
RATIO="${3:-0.5}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/assets/people/$NAME.glb"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$ROOT/assets/people"

case "$(printf %s "$IN" | tr "[:upper:]" "[:lower:]")" in
  *.fbx)
    echo "→ converting FBX to glTF"
    # the fbx2gltf npm package ships a native binary but no npx entry point
    TOOLS="$ROOT/tools/.fbx2gltf"
    [ -d "$TOOLS/node_modules/fbx2gltf" ] || npm install --silent --prefix "$TOOLS" fbx2gltf@0.9.7-p1
    "$TOOLS/node_modules/fbx2gltf/bin/$(uname -s)/FBX2glTF" --binary --input "$IN" --output "$TMP/model"
    SRC="$TMP/model.glb" ;;
  *.glb|*.gltf) SRC="$IN" ;;
  *) echo "unsupported file: $IN (use .glb, .gltf or .fbx)"; exit 1 ;;
esac

echo "→ optimizing (keep ${RATIO} of the triangles, 1024 px WebP textures)"
npx --yes @gltf-transform/cli@4.1.1 optimize "$SRC" "$OUT" \
  --compress quantize --texture-compress webp --texture-size 1024 \
  --simplify true --simplify-ratio "$RATIO" --simplify-error 0.002

# low-detail copy for people far from the camera: ~1/4 of the triangles, tiny textures
# (only its geometry is used). Skipped for models that are already light.
LOD=""
TRIS=$(npx --yes @gltf-transform/cli@4.1.1 inspect "$OUT" 2>/dev/null | awk -F'│' '/TRIANGLES/ { gsub(/[ ,]/, "", $6); s += $6 } END { print s + 0 }')
if [ "${TRIS:-0}" -gt 15000 ]; then
  echo "→ low-detail copy ($TRIS triangles → about a quarter)"
  mkdir -p "$ROOT/assets/people/lod"
  npx --yes @gltf-transform/cli@4.1.1 simplify "$OUT" "$ROOT/assets/people/lod/$NAME.glb" --ratio 0.22 --error 0.02
  npx --yes @gltf-transform/cli@4.1.1 resize "$ROOT/assets/people/lod/$NAME.glb" "$ROOT/assets/people/lod/$NAME.glb" --width 8 --height 8
  LOD="lod/$NAME.glb"
fi

python3 - "$ROOT/assets/people/index.json" "$NAME.glb" "$LOD" <<'PY'
import json, sys, os
p = sys.argv[1]
data = json.load(open(p)) if os.path.exists(p) else []
for f in sys.argv[2:]:
    if f and f not in data: data.append(f)
json.dump(sorted(data), open(p, 'w'), indent=1)
PY
echo "✓ installed $OUT ($(du -h "$OUT" | cut -f1)). Reload the page (Cmd+Shift+R)."
