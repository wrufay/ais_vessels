# July 13th, 2026

Git notes from today.

## `git revert` vs `git cherry-pick`

- `cherry-pick <commit>` copies a commit's changes onto your current branch.
- `revert <commit>` does the opposite — it undoes a specific commit's changes by applying the inverse of its diff, without touching any commits before or after it.

Used `revert` to remove the "hover over vessels to highlight" feature (`67309d2`) while keeping everything from the webGL speed improvements commit (`76491ee`) onward:

```
git checkout -b remove-hover main
git revert 67309d2
```

## Why the revert applied cleanly

Git patches apply hunk-by-hunk using the surrounding context lines, not absolute line numbers. A conflict only happens when a later commit edited the same lines (or lines right next to them) that the reverted commit touched. The hover-highlight feature and the webGL/performance work mostly lived in separate parts of `Map.tsx` and `mapStyles.ts`, so git could still find the original context and cleanly undo just the hover piece.

If two commits touch the same lines, revert (like a merge) stops and asks you to resolve the conflict by hand.

## Detached HEAD

Checking out a commit directly (`git checkout <hash>`) instead of a branch puts you in a detached HEAD state — useful for testing an old commit, but any new commits made there aren't on a branch and can get lost. Safer to branch off before doing real work:

```
git checkout -b my-branch <commit-hash>
```

or use a worktree to test a commit without disturbing the current working directory:

```
git worktree add ../vessel-tracks-test <commit-hash>
```

## Security note

Found that `origin` was configured with a GitHub personal access token embedded directly in the remote URL (`https://user:ghp_...@github.com/...`). This sits in plaintext in `.git/config` and leaks into logs/output any time git prints the remote — should rotate the token and switch to SSH or a credential helper instead.

## TODO: broken venv (`ocean_noise_visualizer` → `vessel-tracks` rename)

Both `venv/` and `.venv/` were created back when this project lived at `~/Desktop/projects/ocean_noise_visualizer`. After the folder got renamed to `vessel-tracks`, the console-script shims (`venv/bin/uvicorn`, etc.) still have the old absolute path baked into their shebang line, so running them directly fails with `cannot execute: required file not found`.

Workaround for now — call the module directly instead of the broken script:
```
venv/bin/python -m uvicorn main:app --reload --port 8001
```

Proper fix later: recreate the venv fresh at the current path (`python -m venv venv --clear` + reinstall from `requirements.txt`).
