# Apply shadcn preset `b1tzNKAUa` to OneFlow frontend

**Date:** 2026-06-17
**Status:** Approved
**Scope:** `frontend/`

## Goal

Apply the shadcn registry preset code `b1tzNKAUa` to the OneFlow frontend, changing the visual theme, icon library, and font in one operation.

## Preset contents (decoded)

Verified via `npx shadcn@latest preset decode b1tzNKAUa`:

| Field | Value | Current |
| --- | --- | --- |
| style | `sera` | `radix-nova` |
| baseColor | `mist` | `neutral` |
| theme | `mist` | (default) |
| chartColor | `cyan` | (default) |
| iconLibrary | `remixicon` | `lucide` |
| font | `figtree` | (default) |
| fontHeading | `inherit` | (default) |
| radius | `default` | (default) |
| menuAccent | `subtle` | `subtle` |
| menuColor | `default` | `default` |

Preset URL: https://ui.shadcn.com/create?preset=b1tzNKAUa

## Approach

Run the official shadcn `apply` command inside `frontend/`, with `--yes` to skip confirmation prompts and apply the full preset (theme + font + components + icon library).

**Command:**

```bash
cd frontend && npx -y shadcn@latest apply b1tzNKAUa --yes
```

## Expected effects

1. `frontend/components.json` updated:
   - `style`: `radix-nova` → `sera`
   - `tailwind.baseColor`: `neutral` → `mist`
   - `iconLibrary`: `lucide` → `remixicon`
2. `frontend/app/globals.css` rewritten with:
   - New CSS variables for the `mist` color palette
   - `figtree` font import + assignment
   - Updated radius/chart tokens
3. Dependencies:
   - `remixicon` package may be added
   - `lucide-react` may be removed (or retained if not conflicting)
4. UI components under `frontend/components/ui/` may be reinstalled to match the new style.
5. Application code that imports `lucide-react` icons will need to be migrated to `remixicon` if the icon library swap is enforced.

## Out of scope

- No business-logic changes
- No backend changes
- No new feature work
- No manual icon-by-icon translation (handled by the apply step + any necessary follow-up migration)

## Verification

After apply:

1. `git status` shows the expected file changes in `frontend/`.
2. `frontend/components.json` reflects the new style/baseColor/iconLibrary values.
3. `frontend/app/globals.css` contains the `mist` color variables and `figtree` font.
4. `pnpm dev` (or `npm run dev`) starts the dev server without theme/CSS errors.
5. `pnpm lint` passes.
6. Visual check: app renders with the mist palette, figtree font, and remixicon icons.

## Rollback

If the result is unsatisfactory:

```bash
git checkout -- frontend/components.json frontend/app/globals.css frontend/components/ui
git clean -fd frontend/components/ui   # if apply added new files
```

Then revert any package.json/lockfile changes via `git checkout`.
