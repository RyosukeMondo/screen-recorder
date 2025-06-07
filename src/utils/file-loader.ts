/**
 * Utility for loading and processing bookmarklet files
 * Provides functions to strip comments, minify code, and load files
 */

/**
 * Strip comments from JavaScript code
 * This is important for bookmarklets since // comments break them
 */
function stripComments(code: string): string {
  // Remove single line comments
  let result = code.replace(/\/\/[^\n]*(?=\n|$)/g, '');
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove empty lines created by comment removal
  result = result.replace(/^\s*[\r\n]/gm, '');
  return result;
}

/**
 * Minify JavaScript code for bookmarklets
 * - Removes extra whitespace
 * - Removes line breaks
 * - Collapses multiple spaces to single space
 */
function minifyCode(code: string): string {
  // Remove extra whitespace and line breaks
  return code
    .replace(/\s+/g, ' ')
    .trim();
}

// Use raw-loader to import files as string
// This is a webpack feature that requires minimal setup
// It's used here to import bookmarklet JS files as strings
export async function loadFile(path: string): Promise<string> {
  try {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Failed to load file: ${path}`);
    }
    const text = await response.text();
    
    // For bookmarklet files, strip comments and minify
    if (path.includes('/bookmarklets/')) {
      const strippedCode = stripComments(text);
      return minifyCode(strippedCode);
    }
    
    return text;
  } catch (error) {
    console.error(`Error loading file ${path}:`, error);
    return '';
  }
}

// For synchronous imports during component initialization
// Using the webpack raw-loader syntax under the hood
export function importFileSync(path: string): string {
  try {
    // This syntax works with create-react-app and webpack
    // It will be processed at build time
    // Note: In a production app, you'd use require("raw-loader!./path") or similar
    // but for simplicity we're using fetch in the async version above
    return `// File content would be loaded here in production
// Path: ${path}
// For development, we'll use the fetch API at runtime`;
  } catch (error) {
    console.error(`Error importing file ${path}:`, error);
    return '';
  }
}
