import { cp, mkdir } from 'node:fs/promises';

// Compiled migrate.js resolves ../../migrations relative to its own module.
const target = new URL('../server/dist/server/migrations/', import.meta.url);
await mkdir(target, { recursive: true });
await cp(new URL('../server/migrations/', import.meta.url), target, {
  recursive: true,
});
