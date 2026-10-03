export function resolveApiOrigin(value: string | undefined): string {
  if (!value?.trim()) return '';
  const url = new URL(value.trim());
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error(
      'VITE_API_URL must be an HTTP(S) origin without credentials or a path.',
    );
  return url.origin;
}
