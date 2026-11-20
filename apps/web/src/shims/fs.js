// The browser analyzer never touches the filesystem; files arrive as bytes.
// Some core modules import these names for CLI-only paths that are never called here.
const unavailable = () => {
  throw new Error('File system access is not available in the browser.');
};
export const readFile = unavailable;
export const writeFile = unavailable;
export const mkdir = unavailable;
export const stat = unavailable;
export const readdir = unavailable;
export const rm = unavailable;
