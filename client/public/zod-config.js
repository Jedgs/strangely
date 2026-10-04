// Set this before the application bundle imports Zod. This keeps validation
// compatible with the site's strict CSP without enabling unsafe-eval.
globalThis.__zod_globalConfig = { jitless: true };
