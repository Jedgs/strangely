import { resolveApiOrigin } from './backend-config';
// Public API origin only. VITE_* values are embedded in the browser bundle.
export const API_ORIGIN = resolveApiOrigin(import.meta.env.VITE_API_URL);
export const apiUrl = (path: string) => `${API_ORIGIN}${path}`;
