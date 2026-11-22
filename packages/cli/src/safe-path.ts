import { isAbsolute, resolve, sep } from 'node:path';

/**
 * Resolve `relPath` strictly inside `baseDir`. Rejects empty strings, NUL
 * bytes, absolute paths, and `..` traversal escaping `baseDir`.
 */
export function resolveSafeChild(baseDir: string, relPath: string): string {
  if (!relPath || relPath.includes('\0') || isAbsolute(relPath) || relPath.startsWith('\\')) {
    throw new Error(`Unsafe relative path "${relPath}".`);
  }
  const root = resolve(baseDir);
  const target = resolve(root, relPath);
  if (!target.startsWith(root + sep)) {
    throw new Error(`Path "${relPath}" escapes "${root}".`);
  }
  return target;
}
