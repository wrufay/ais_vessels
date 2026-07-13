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

## Feature: user-adjustable noise colour scale

The noise overlay (`analysis/noise.py`) renders a GeoTIFF dB grid as a colour-mapped PNG. The GeoTIFF itself is just raw floats (`ds.read(1)` — one band, no colour), so the colour mapping happens fresh on every request, server-side, via matplotlib's `RdYlBu_r` colormap normalized to a `vmin`/`vmax` dB range. Previously that range was always auto-computed as the image's own 2nd–98th percentile — meaning colours were never comparable across two different dates/overlays, since each was stretched to its own range independently.

Added the ability for the user to set `vmin`/`vmax` manually, so the same colour scale can be held fixed while browsing different dates.

**`analysis/noise.py`** — `render_noise_overlay()` now takes optional `vmin`/`vmax` args. If either is left as `None`, it falls back to the existing auto percentile calculation; passing both skips that entirely and uses exactly what's given.

**`main.py`** and **`mock_api/main.py`** — both add `vmin`/`vmax` as optional query params on `GET /api/noise/overlay`, passed straight through to `render_noise_overlay()`. Since both APIs import the same `analysis/noise.py`, this one function change covers both — no duplicated logic.

**`frontend/src/Map.tsx`** — the static "Low dB"/"High dB" labels under the noise colour bar became two live number inputs (`noiseVminOverride` / `noiseVmaxOverride` state). Editing either refetches the overlay with the new range; a "Reset to auto" link clears both back to the auto-computed scale. The override **persists across date changes** (deliberately) rather than resetting each time — the whole point is being able to flip through dates on a fixed scale for comparison.

Ran into a string of controlled-input bugs building the two dB inputs, worth remembering:

- **Reformatting mid-keystroke breaks multi-digit typing.** First version derived the input's `value` via `.toFixed(1)` on every render. Typing "40" would reformat to "4.0" after the very first keystroke, fighting the second one. Fix: don't reformat on every keystroke — either buffer raw text separately and only reformat on blur, or (what we ended up with) avoid decimal formatting entirely and derive `value` from a plain rounded integer, which stringifies stably during typing.
- **Firefox-specific: typing letters got through** despite `type="number"`, even though visually-identical opacity/size inputs elsewhere in the app (also `type="number"`) don't have this problem. Root cause never fully pinned down, but matching the *exact* working pattern from those other inputs — single number state, `value={Math.round(...)}`, immediate commit in `onChange`, no extra `onBlur`/`onKeyDown`/regex layered on top — fixed it. Lesson: when a working pattern already exists elsewhere in the codebase for the same kind of input, copy its structure exactly rather than reinventing one.
- **`Number("")` is `0`, not `NaN`.** Clearing the field and typing a fresh digit could leave a stray leading zero (e.g. "04") for a keystroke before the round-trip corrected it. Fixed by stripping any leading zero followed by another digit (`replace(/^0+(?=\d)/, "")`) before committing.
- Native number-input spinner arrows are hidden **app-wide** via CSS in `index.css` (`-moz-appearance: textfield` etc.) — deliberate, for the many small size/opacity inputs elsewhere. Added a scoped `.spin-arrows` class to re-enable them just for these two dB inputs, since arrows are actually useful here.
