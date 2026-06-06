#!/bin/bash
# release.sh — TradeLinks version bump + doc sync + git tag.
# Usage: ./scripts/release.sh [patch|minor|major]
#
# Canonical version lives in package.json. This bumps it, syncs CLAUDE.md +
# .agent/CURRENT.md, prepends a CHANGELOG stub, commits, tags vX.Y.Z, and pushes.
set -e

BUMP_TYPE=${1:-patch}
TODAY_STR=$(date +%Y-%m-%d)

case "$BUMP_TYPE" in patch|minor|major) ;; *) echo "Usage: $0 [patch|minor|major]"; exit 1 ;; esac

OLD_VERSION=$(node -p "require('./package.json').version")
# bump package.json only (we create the git tag ourselves, below)
NEW_VERSION=$(npm version "$BUMP_TYPE" --no-git-tag-version | tr -d 'v')
echo "Bumping v${OLD_VERSION} → v${NEW_VERSION} (${BUMP_TYPE})"

# --- doc sync ---
sed -i.bak "s/^\*\*Version:\*\*.*$/\*\*Version:\*\*  v${NEW_VERSION}/" CLAUDE.md && rm -f CLAUDE.md.bak

if [[ -f .agent/CURRENT.md ]]; then
  sed -i.bak "s/^Version:.*$/Version:        v${NEW_VERSION}/" .agent/CURRENT.md
  sed -i.bak "s/^Last Updated:.*$/Last Updated:   ${TODAY_STR} by [agent-id]  ← 请更新/" .agent/CURRENT.md
  rm -f .agent/CURRENT.md.bak
fi

# prepend a CHANGELOG entry above the most recent release section
if [[ -f CHANGELOG.md ]]; then
  awk -v entry="## [${NEW_VERSION}] — ${TODAY_STR}\n\n### Added\n- [请补充]\n" \
    '!done && /^## \[/ { printf "%s\n", entry; done=1 } { print }' CHANGELOG.md > CHANGELOG.tmp \
    && mv CHANGELOG.tmp CHANGELOG.md
fi

# --- commit + tag + push ---
git add -A
git commit -m "chore: release v${NEW_VERSION}

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git tag "v${NEW_VERSION}"
git push origin HEAD --follow-tags

echo "✅ Released v${NEW_VERSION} (committed, tagged, pushed)"
echo "POST: 在 CHANGELOG.md 补 v${NEW_VERSION} 条目 + .agent/CURRENT.md 的 Last Updated agent-id"
