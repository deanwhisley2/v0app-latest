#!/bin/bash
cd ~/Downloads/v0app_latest

CURRENT_BRANCH=$(git branch --show-current)
echo "🤖 Auto-merging $CURRENT_BRANCH → main"

# Fetch latest
git fetch origin --quiet

# Update main
git checkout main --quiet
git pull --no-edit --quiet origin main

# Go back to feature branch and merge main into it first (to resolve conflicts)
git checkout $CURRENT_BRANCH --quiet
echo "🔄 Merging latest main into $CURRENT_BRANCH..."
git merge --no-edit -X theirs origin/main 2>/dev/null

# Now switch to main and merge the feature branch
git checkout main --quiet
echo "🔄 Merging $CURRENT_BRANCH into main..."
git merge --no-edit -X theirs $CURRENT_BRANCH 2>/dev/null

# Push the merged main
git push --quiet origin main
echo "✅ Successfully merged and pushed to main!"

# Go back to feature branch
git checkout $CURRENT_BRANCH --quiet

echo "✨ Merge completed silently!"
