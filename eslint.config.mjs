import nextCoreWebVitals from "eslint-config-next/core-web-vitals"

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      // Node utilities with embedded template blobs — not part of the Next.js app bundle.
      "scripts/**",
    ],
  },
  ...nextCoreWebVitals,
]
