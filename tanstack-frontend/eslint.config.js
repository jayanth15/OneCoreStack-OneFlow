//  @ts-check

import { tanstackConfig } from "@tanstack/eslint-config"
import reactHooks from "eslint-plugin-react-hooks"

export default [
  ...tanstackConfig,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "import/no-cycle": "off",
      "import/order": "off",
      "sort-imports": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/require-await": "off",
      "pnpm/json-enforce-catalog": "off",
      // API boundary code is defensive about backend payload shapes
      // (e.g. `me.field ?? []` where the TS type marks it non-optional).
      "@typescript-eslint/no-unnecessary-condition": "off",
    },
  },
  {
    ignores: ["eslint.config.js", ".prettierrc"],
  },
]
