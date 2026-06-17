# Apply shadcn preset `b1tzNKAUa` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the shadcn registry preset `b1tzNKAUa` to the OneFlow frontend, updating theme, font, and icon library in one operation.

**Architecture:** Use the official `shadcn apply` CLI command inside the `frontend/` directory. The CLI reads the preset code, decodes it locally, then rewrites `components.json`, `app/globals.css`, and reinstalls affected UI components. We commit the result as a single atomic change.

**Tech Stack:** shadcn CLI v3, Next.js 16, Tailwind v4, React 19.

---

## File Structure

**Files modified by the `apply` command (auto-handled by shadcn CLI):**
- `frontend/components.json` — style, baseColor, iconLibrary, etc.
- `frontend/app/globals.css` — CSS variables, font import, theme tokens
- `frontend/components/ui/*` — possibly reinstalled to match the new style
- `frontend/package.json` + `frontend/package-lock.json` — possibly add/remove icon packages

**No files created manually by us.** The CLI is the only agent that mutates the project.

**No tests added.** This is a theme/visual change; the test plan is the visual + build verification described in Task 3.

---

## Task 1: Capture pre-apply baseline

**Files:**
- Read-only: `frontend/components.json`
- Read-only: `frontend/package.json`

- [ ] **Step 1: Record current state**

Run from repo root:

```bash
cat frontend/components.json
git status --short
git log --oneline -1
```

Expected: `components.json` shows `style: "radix-nova"`, `baseColor: "neutral"`, `iconLibrary: "lucide"`. Working tree should be clean (or have only the spec commit from brainstorming). Record the current commit SHA for rollback reference.

- [ ] **Step 2: Confirm clean working tree**

Run: `git status --short`
Expected: empty output (or only the spec commit). If there are uncommitted changes in `frontend/`, stop and ask the user to commit or stash them before applying the preset.

- [ ] **Step 3: Confirm shadcn CLI resolves**

Run: `npx -y shadcn@latest --version`
Expected: prints a version number (e.g., `3.x.x`). If the command fails or the version is below 3.0, stop and ask the user to update the CLI.

No commit needed — this task is observation only.

---

## Task 2: Apply the preset

**Files:**
- Modify (auto): `frontend/components.json`
- Modify (auto): `frontend/app/globals.css`
- Modify (auto): `frontend/components/ui/*` (potentially)
- Modify (auto): `frontend/package.json` + `frontend/package-lock.json` (potentially)

- [ ] **Step 1: Run the apply command**

Run from repo root:

```bash
cd frontend && npx -y shadcn@latest apply b1tzNKAUa --yes
```

The `--yes` flag auto-accepts all confirmation prompts (overwrites, package installs, etc.).

- [ ] **Step 2: Verify the command exited successfully**

Run: `echo $?`
Expected: `0`

If non-zero, capture the output, run `git checkout -- frontend/` to roll back, and stop to investigate.

- [ ] **Step 3: Inspect the resulting diff**

Run from repo root:

```bash
git status --short
git diff --stat
```

Expected: changes confined to `frontend/components.json`, `frontend/app/globals.css`, `frontend/components/ui/*`, and possibly `frontend/package.json` / `frontend/package-lock.json`. If changes appear outside `frontend/`, stop and review.

- [ ] **Step 4: Confirm key config values updated**

Run: `cat frontend/components.json`
Expected output contains:
- `"style": "sera"`
- `"baseColor": "mist"`
- `"iconLibrary": "remixicon"`

- [ ] **Step 5: Confirm new theme tokens in globals.css**

Run: `grep -E "(--background|--foreground|figtree|remixicon)" frontend/app/globals.css | head -20`
Expected: matches for the `mist` color variables and `figtree` font. If absent, stop and review.

- [ ] **Step 6: Commit the applied preset**

Run from repo root:

```bash
git add frontend/components.json frontend/app/globals.css frontend/components frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): apply shadcn preset b1tzNKAUa (sera/mist/remixicon/figtree)"
```

---

## Task 3: Verify the application still builds and lints

**Files:**
- Read-only verification of the committed changes

- [ ] **Step 1: Install updated dependencies**

Run: `cd frontend && npm install`
Expected: completes without errors. If peer-dep warnings appear that block install, stop and review.

- [ ] **Step 2: Run the linter**

Run: `cd frontend && npm run lint`
Expected: `0` exit code, no errors. Warnings are acceptable; errors are not.

- [ ] **Step 3: Run a production build (optional but recommended)**

Run: `cd frontend && npm run build`
Expected: build completes successfully. The `--webpack` flag is already in the `build` script, so this exercises the same path used in CI. If the build fails, capture the error, decide whether to fix forward or roll back, and update the commit accordingly.

- [ ] **Step 4: Spot-check the dev server (manual)**

Run: `cd frontend && npm run dev`
Expected: server starts on its usual port without CSS/import errors. Open the app in a browser and confirm:
- The `mist` color palette is applied
- The `figtree` font is rendered
- Icons render (verify the icon swap from `lucide` to `remixicon` didn't break layouts)

Stop the dev server with Ctrl-C when verification is complete.

- [ ] **Step 5: Final commit if any auto-fixups were needed**

If step 2, 3, or 4 surfaced issues that were fixed inline:

```bash
git add -A
git commit -m "fix(frontend): resolve lint/build issues from shadcn preset apply"
```

Otherwise, no commit is needed.

---

## Rollback (if anything goes wrong)

From repo root:

```bash
git reset --hard HEAD~1   # undo the apply commit
git clean -fd frontend/components/ui   # remove any new files the CLI added
npm install --prefix frontend
```

This restores the project to the state captured in Task 1.
