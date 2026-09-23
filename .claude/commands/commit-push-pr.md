---
description: Commit staged changes, push to the current branch, and open a PR with gh pr create --fill
argument-hint: "[optional extra context for the commit message]"
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git branch:*), Bash(git commit:*), Bash(git push:*), Bash(gh pr:*)
---

Extra context from the user: $ARGUMENTS

## Task

Commit the staged changes, push them to the current branch, and open a pull request.

Run these steps in order:

1. **`git status`** — show what will be committed. If nothing is staged, stop and tell the user which files are unstaged or untracked so they can stage what they want. Do not `git add` anything yourself.
2. **`git diff --staged`** — read the actual staged changes before writing anything. Base the message on what the change *does*, not on the file names.
3. **Write a commit message in Conventional Commits format** based on what is staged: `type(scope): summary`, where `type` is one of `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, or `revert`. Subject line in imperative mood, no trailing period, ≤ 72 chars. Add a body only when the *why* isn't obvious from the subject.
4. **`git commit -m "<message>"`** — use a heredoc if the message has a body. If a pre-commit hook rejects the commit, report the failure and stop; do not use `--no-verify`.
5. **`git push origin <current-branch>`** — get the branch name from `git branch --show-current` and push to exactly that branch. Never switch or create a branch. If the current branch is the repo's default branch (`main`/`master`), stop and ask the user before pushing.
6. **`gh pr create --fill`** — this uses the commit message as the PR title and body. If a PR for this branch already exists, `gh` will say so; in that case report the existing PR URL instead of creating a new one.

Report the commit SHA and the PR URL when done.
