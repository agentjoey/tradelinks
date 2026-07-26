/**
 * Evidence tooling for pact task coverage-readiness (Phase 1, Task 7).
 *
 * /admin/sources is auth-gated (Neon Auth) and no credentials exist in this
 * environment, so this harness renders the REAL page component to static
 * markup against the isolated Neon branch (DATABASE_URL, process-scoped) and
 * wraps it in the app's own globals.css tokens for browser screenshots.
 * Fonts fall back to Georgia/system-ui (next/font variables are not set).
 *
 * Usage:
 *   npx tailwindcss -i app/globals.css -o design/shots/task7-sources/app.css --minify
 *   DATABASE_URL=... npx tsx design/shots/task7-sources/render.tsx
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

import SourcesHealthPage from "../../../app/admin/sources/page.js";

// tsconfig keeps `jsx: preserve`, so tsx emits classic React.createElement
// calls; the page (a Next automatic-runtime module) imports no React binding.
import React from "react";
(globalThis as Record<string, unknown>).React = React;

const here = dirname(fileURLToPath(import.meta.url));

const shell = (theme: "dark" | "light", body: string) => `<!doctype html>
<html lang="en" data-theme="${theme}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Admin · Sources (${theme})</title>
<link rel="stylesheet" href="./app.css" />
</head>
<body class="min-h-screen font-sans antialiased">
<div class="mx-auto max-w-[88rem] px-5 sm:px-8 py-8">
${body}
</div>
</body>
</html>
`;

const page = await SourcesHealthPage();
const body = renderToStaticMarkup(page);

mkdirSync(here, { recursive: true });
for (const theme of ["dark", "light"] as const) {
  writeFileSync(join(here, `page-${theme}.html`), shell(theme, body));
}
console.log("wrote page-dark.html and page-light.html");
process.exit(0);
