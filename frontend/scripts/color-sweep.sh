#!/bin/bash
# Phase 5: Hardcoded color sweep — replace Tailwind palette classes with semantic tokens
# Run from frontend/ directory

set -e

# 1. Remove all dark: variants (light-only mode)
find app/dashboard -name "*.tsx" -exec sed -i 's/ dark:[^ "]*//g' {} +
find app/dashboard -name "*.tsx" -exec sed -i 's/"dark:[^ "]* /"/g' {} +

# 2. Replace bg-* palette with tokens (process 500 before 50 to avoid prefix conflicts)
find app/dashboard -name "*.tsx" -exec sed -i \
  -e 's|bg-violet-500|bg-tone-violet|g' \
  -e 's|bg-violet-100|bg-tone-violet/10|g' \
  -e 's|bg-blue-500|bg-primary|g' \
  -e 's|bg-blue-100|bg-primary/10|g' \
  -e 's|bg-blue-50|bg-primary/10|g' \
  -e 's|bg-amber-500|bg-warning|g' \
  -e 's|bg-amber-100|bg-warning/15|g' \
  -e 's|bg-amber-50|bg-warning/15|g' \
  -e 's|bg-emerald-500|bg-success|g' \
  -e 's|bg-emerald-100|bg-success/10|g' \
  -e 's|bg-emerald-50|bg-success/10|g' \
  -e 's|bg-sky-100|bg-primary/10|g' \
  -e 's|bg-orange-100|bg-tone-amber/15|g' \
  -e 's|bg-indigo-100|bg-tone-violet/10|g' \
  -e 's|bg-teal-100|bg-tone-emerald/10|g' \
  -e 's|bg-red-500|bg-destructive|g' \
  -e 's|bg-red-100|bg-destructive/10|g' \
  -e 's|bg-red-50|bg-destructive/10|g' \
  -e 's|bg-green-500|bg-success|g' \
  -e 's|bg-green-100|bg-success/10|g' \
  -e 's|bg-green-50|bg-success/10|g' \
  -e 's|bg-slate-500|bg-muted-foreground|g' \
  -e 's|bg-slate-400|bg-muted-foreground|g' \
  -e 's|bg-slate-200|bg-muted|g' \
  -e 's|bg-slate-100|bg-muted|g' \
  -e 's|bg-slate-50|bg-muted|g' \
  -e 's|bg-white|bg-card|g' \
  {} +

# 3. Replace text-* palette with tokens (process 700/600/500 before 50)
find app/dashboard -name "*.tsx" -exec sed -i \
  -e 's|text-violet-700|text-tone-violet|g' \
  -e 's|text-violet-500|text-tone-violet|g' \
  -e 's|text-violet-400|text-tone-violet|g' \
  -e 's|text-blue-700|text-primary|g' \
  -e 's|text-blue-600|text-primary|g' \
  -e 's|text-blue-500|text-primary|g' \
  -e 's|text-blue-400|text-primary|g' \
  -e 's|text-amber-700|text-warning|g' \
  -e 's|text-amber-600|text-warning|g' \
  -e 's|text-amber-500|text-warning|g' \
  -e 's|text-amber-400|text-warning|g' \
  -e 's|text-emerald-700|text-success|g' \
  -e 's|text-emerald-600|text-success|g' \
  -e 's|text-emerald-500|text-success|g' \
  -e 's|text-emerald-400|text-success|g' \
  -e 's|text-sky-700|text-primary|g' \
  -e 's|text-sky-600|text-primary|g' \
  -e 's|text-orange-700|text-tone-amber|g' \
  -e 's|text-orange-600|text-tone-amber|g' \
  -e 's|text-indigo-700|text-tone-violet|g' \
  -e 's|text-indigo-600|text-tone-violet|g' \
  -e 's|text-teal-700|text-tone-emerald|g' \
  -e 's|text-teal-600|text-tone-emerald|g' \
  -e 's|text-red-700|text-destructive|g' \
  -e 's|text-red-600|text-destructive|g' \
  -e 's|text-red-500|text-destructive|g' \
  -e 's|text-red-400|text-destructive|g' \
  -e 's|text-green-700|text-success|g' \
  -e 's|text-green-600|text-success|g' \
  -e 's|text-green-500|text-success|g' \
  -e 's|text-slate-600|text-muted-foreground|g' \
  -e 's|text-slate-500|text-muted-foreground|g' \
  -e 's|text-slate-400|text-muted-foreground|g' \
  {} +

# 4. Replace border-* palette with tokens
find app/dashboard -name "*.tsx" -exec sed -i \
  -e 's|border-slate-300|border-border|g' \
  -e 's|border-slate-200|border-border|g' \
  -e 's|border-slate-100|border-border|g' \
  -e 's|border-violet-200|border-tone-violet/20|g' \
  -e 's|border-blue-200|border-primary/20|g' \
  -e 's|border-amber-200|border-warning/20|g' \
  -e 's|border-emerald-200|border-success/20|g' \
  -e 's|border-red-200|border-destructive/20|g' \
  -e 's|border-green-200|border-success/20|g' \
  {} +

# 5. Replace ring-* palette with tokens
find app/dashboard -name "*.tsx" -exec sed -i \
  -e 's|ring-blue-500|ring-primary|g' \
  -e 's|ring-red-500|ring-destructive|g' \
  -e 's|ring-emerald-500|ring-success|g' \
  -e 's|ring-amber-500|ring-warning|g' \
  {} +

# 6. Replace fill-* and stroke-* palette (used in some SVG/icon contexts)
find app/dashboard -name "*.tsx" -exec sed -i \
  -e 's|fill-green-500|fill-success|g' \
  -e 's|fill-red-500|fill-destructive|g' \
  -e 's|fill-blue-500|fill-primary|g' \
  -e 's|fill-amber-500|fill-warning|g' \
  -e 's|fill-emerald-500|fill-success|g' \
  {} +

echo "Color sweep complete."
