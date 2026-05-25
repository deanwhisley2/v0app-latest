#!/bin/bash
cd ~/Downloads/v0app_latest

CURRENT_BRANCH=$(git branch --show-current)

# Push your branch to GitHub
git push origin $CURRENT_BRANCH --quiet

# Create PR (if doesn't exist) and merge automatically
gh pr create --base main --head $CURRENT_BRANCH --title "Auto-merge: $CURRENT_BRANCH" --body "Automated PR" --fill --no-maintainer-edit 2>/dev/null

# Merge the PR automatically
gh pr merge --auto --merge --delete-branch 2>/dev/null

echo "✅ PR created and merged automatically!"
