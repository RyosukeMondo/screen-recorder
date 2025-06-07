/**
 * Utility functions for bookmarklet creation and management
 * Adapted from bookmarklet_convert.js
 */

/**
 * Compacts JavaScript code by removing unnecessary whitespace
 * for bookmarklet optimization
 */
export function compactCode(code: string): string {
  let s = code;
  s = s.replace(/\s*;\s*/g, ";");
  s = s.replace(/\s*=\s*/g, "=");
  s = s.replace(/\s*\(\s*/g, "(");
  s = s.replace(/\s*\)\s*/g, ")");
  s = s.replace(/\s*\{\s*/g, "{");
  s = s.replace(/\s*\}\s*/g, "}");
  s = s.replace(/\s*,\s*/g, ",");
  s = s.replace(/\s+/g, " ");
  s = s.replace(/^\s*/g, "");
  s = s.replace(/\s*$/g, "");
  return s;
}

/**
 * Converts JavaScript code into a bookmarklet URL that can be
 * used as href in anchor tags
 */
export function createBookmarkletHref(code: string): string {
  const compacted = compactCode(code);
  // Remove any existing javascript: prefix if it exists
  const cleanCode = compacted.replace(/^javascript:/, '');
  // Encode the compacted code and create the bookmarklet URL
  return `javascript:${encodeURIComponent(cleanCode)}void(0);`;
}

/**
 * Generates an HTML string for a draggable bookmarklet link
 */
export function createDraggableBookmarklet(name: string, code: string): string {
  const href = createBookmarkletHref(code);
  return `<a href="${href}" 
    class="bookmarklet-drag" 
    draggable="true" 
    title="Drag this to your bookmarks bar">
    ${name}
  </a>`;
}

/**
 * Extracts the code portion from a bookmarklet string
 * Handles strings starting with "javascript:"
 */
export function extractCodeFromBookmarklet(bookmarklet: string): string {
  if (!bookmarklet.startsWith('javascript:')) {
    return bookmarklet;
  }
  
  // Remove javascript: prefix and void(0); suffix if present
  let code = bookmarklet.replace(/^javascript:/, '');
  code = code.replace(/void\(0\);$/, '');
  
  try {
    // If the code is URL encoded, decode it
    if (/%[0-9A-F]{2}/.test(code)) {
      code = decodeURIComponent(code);
    }
  } catch (e) {
    console.error('Failed to decode bookmarklet:', e);
  }
  
  return code;
}
