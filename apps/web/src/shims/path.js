export const sep = '/';
export function isAbsolute(p) {
  return String(p).startsWith('/') || /^[A-Za-z]:[\\/]/.test(String(p));
}
export function resolve(...parts) {
  return join(...parts);
}
export function basename(p) {
  return String(p).split(/[\\/]/).pop() ?? '';
}
export function dirname(p) {
  return String(p).split(/[\\/]/).slice(0, -1).join('/') || '.';
}
export function join(...parts) {
  return parts.join('/').replace(/\/+/g, '/');
}
