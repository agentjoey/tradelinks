#!/bin/bash
# release.sh — TradeLinks version bump + doc sync
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

BUMP_TYPE=${1:-patch}
AGENT_CURRENT=".agent/CURRENT.md"
TODAY_STR=$(date +%Y-%m-%d)

# Read current version from CLAUDE.md
CURRENT_VERSION=$(grep '^\*\*Version:\*\*' CLAUDE.md | sed 's/.*v//' | tr -d ' ')
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  patch) NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH+1))" ;;
  minor) NEW_VERSION="${MAJOR}.$((MINOR+1)).0" ;;
  major) NEW_VERSION="$((MAJOR+1)).0.0" ;;
  *) echo "Usage: $0 [patch|minor|major]"; exit 1 ;;
esac

echo "Bumping v${CURRENT_VERSION} → v${NEW_VERSION} (${BUMP_TYPE})"

# Doc Sync
if [[ -f "$AGENT_CURRENT" ]]; then
  sed -i.bak "s/^Version:.*$/Version:        v${NEW_VERSION}/" "$AGENT_CURRENT"
  sed -i.bak "s/^Last Updated:.*$/Last Updated:   ${TODAY_STR} by [agent-id]  ← 请更新/" "$AGENT_CURRENT"
  if [[ "${BUMP_TYPE}" == "minor" || "${BUMP_TYPE}" == "major" ]]; then
    sed -i.bak "s/^Sprint Status:.*$/Sprint Status:  ✅ Done/" "$AGENT_CURRENT"
  fi
  # Append version history row
  sed -i.bak "/^| Version | Date | Summary |/a | v${NEW_VERSION} | ${TODAY_STR} | [请补充] |" "$AGENT_CURRENT"
  rm -f "${AGENT_CURRENT}.bak"
fi

sed -i.bak "s/^\*\*Version:\*\*.*$/\*\*Version:\*\*  v${NEW_VERSION}/" CLAUDE.md && rm -f CLAUDE.md.bak

git add .agent/CURRENT.md CLAUDE.md
git commit -m "chore: release v${NEW_VERSION}

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

echo "✅ Released v${NEW_VERSION}"
echo ""
echo "POST-RELEASE: 请手动补充 .agent/CURRENT.md Version History 描述 + Last Updated agent-id"
