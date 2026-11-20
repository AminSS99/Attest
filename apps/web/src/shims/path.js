export function basename(p) {
  return String(p).split(/[\\/]/).pop() ?? '';
}
export function dirname(p) {
  return String(p).split(/[\\/]/).slice(0, -1).join('/') || '.';
}
export function join(...parts) {
  return parts.join('/').replace(/\/+/g, '/');
}
