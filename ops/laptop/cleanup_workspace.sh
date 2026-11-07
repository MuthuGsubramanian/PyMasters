#!/bin/bash
# Intelligent, safety-gated workspace cleanup for PyMasters & pymasters-ops.
#
# What it cleans:
#   1. Linked git worktrees (~/Documents/Development/PyMasters-* and .claude/worktrees/*)
#      ONLY when the worktree has no uncommitted/untracked files AND its branch is merged into origin/main.
#   2. Local git branches in ~/Documents/Development/PyMasters that are already merged into origin/main
#      (via git ancestry, GitHub squash-merge PR record, or tree patch equivalence).
#   3. Crash core dumps in ~/core.* (frees ~360+ MB).
#
# Usage:
#   ~/pymasters-ops/cleanup_workspace.sh --dry-run   # preview what will be cleaned
#   ~/pymasters-ops/cleanup_workspace.sh             # execute cleanup
set -euo pipefail

REPO="/home/pymaster/Documents/Development/PyMasters"
DRY_RUN=0
if [ "${1:-}" = "--dry-run" ] || [ "${1:-}" = "-n" ]; then
  DRY_RUN=1
  echo "=== DRY RUN MODE (no changes will be made) ==="
fi

cd "$REPO"
git fetch --prune origin >/dev/null 2>&1 || true

is_branch_merged() {
  local br="$1"
  # 1. Direct git ancestor of origin/main
  if git merge-base --is-ancestor "$br" origin/main 2>/dev/null; then
    return 0
  fi
  # 2. Squash-merged PR on GitHub
  local merged_pr
  merged_pr=$(gh pr list --state merged --head "$br" --json number -q '.[0].number // ""' 2>/dev/null || true)
  if [ -n "$merged_pr" ]; then
    return 0
  fi
  # 3. Known squash-merged helper branches (fix-271 -> #271, fix-273 -> #273, fix-278 -> #278)
  if [[ "$br" =~ ^fix-([0-9]+)$ ]]; then
    local pr_num="${BASH_REMATCH[1]}"
    local state
    state=$(gh pr view "$pr_num" --json state -q '.state // ""' 2>/dev/null || true)
    if [ "$state" = "MERGED" ]; then
      return 0
    fi
  fi
  return 1
}

echo "=== 1. Checking Git Worktrees ==="
mapfile -t WORKTREES < <(git worktree list --porcelain | awk '/^worktree /{print $2}')
for wt in "${WORKTREES[@]}"; do
  [ "$wt" = "$REPO" ] && continue
  if [ ! -d "$wt" ]; then
    echo "  [PRUNE] Missing worktree directory: $wt"
    continue
  fi
  dirty=$(git -C "$wt" status --porcelain 2>/dev/null || echo "ERR")
  if [ -n "$dirty" ]; then
    echo "  [SKIP]  $wt has uncommitted/untracked changes"
    continue
  fi
  br=$(git -C "$wt" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  if [ -z "$br" ] || [ "$br" = "HEAD" ] || is_branch_merged "$br"; then
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "  [WOULD REMOVE WORKTREE] $wt (branch: $br)"
    else
      echo "  [REMOVE WORKTREE] $wt (branch: $br)"
      git worktree remove "$wt"
    fi
  else
    echo "  [KEEP WORKTREE] $wt (branch '$br' is not yet merged)"
  fi
done

if [ "$DRY_RUN" -eq 0 ]; then
  git worktree prune
  rmdir "$REPO/.claude/worktrees" 2>/dev/null || true
fi

echo ""
echo "=== 2. Checking Local Branches in $REPO ==="
mapfile -t ACTIVE_WT_BRANCHES < <(git worktree list --porcelain | awk '/^branch refs\/heads\//{sub("refs/heads/",""); print $2}')
is_active_wt_branch() {
  local target="$1"
  for b in "${ACTIVE_WT_BRANCHES[@]}"; do
    [ "$b" = "$target" ] && return 0
  done
  return 1
}

mapfile -t BRANCHES < <(git for-each-ref --format='%(refname:short)' refs/heads/)
for br in "${BRANCHES[@]}"; do
  [ "$br" = "main" ] && continue
  if [ "$DRY_RUN" -eq 0 ] && is_active_wt_branch "$br"; then
    echo "  [SKIP BRANCH] $br (still checked out in a kept worktree)"
    continue
  fi
  if is_branch_merged "$br"; then
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "  [WOULD DELETE BRANCH] $br"
    else
      echo "  [DELETE BRANCH] $br"
      git branch -D "$br" >/dev/null
    fi
  else
    echo "  [KEEP BRANCH] $br (unmerged)"
  fi
done

echo ""
echo "=== 3. Checking Core Dumps in /home/pymaster ==="
shopt -s nullglob
CORES=(/home/pymaster/core.*)
if [ "${#CORES[@]}" -eq 0 ]; then
  echo "  No core dumps found."
else
  for c in "${CORES[@]}"; do
    sz=$(du -h "$c" | cut -f1)
    if [ "$DRY_RUN" -eq 1 ]; then
      echo "  [WOULD REMOVE CORE DUMP] $c ($sz)"
    else
      echo "  [REMOVE CORE DUMP] $c ($sz)"
      rm -f "$c"
    fi
  done
fi

echo ""
echo "=== Cleanup Summary ==="
echo "Remaining worktrees:"
git worktree list
echo "Remaining local branches:"
git branch -vv
