import { useState, useEffect, useCallback } from 'react';
import { loadFile } from '../utils/file-loader';

export interface Bookmarklet {
  id: string;
  name: string;
  description: string;
  code: string;
  filePath: string;
}

/**
 * Discord Sidebar Toggle bookmarklet metadata
 * The actual code is loaded from an external file in the public directory
 * to avoid escaping issues and make maintenance easier
 */
const discordBookmarkletsMeta: Omit<Bookmarklet, 'code'>[] = [
  {
    id: 'discord-toggle-sidebar',
    name: 'Discord Sidebar Toggle',
    description: 'Hides/shows Discord sidebar to protect private info during screen recording',
    filePath: '/bookmarklets/discord-toggle-sidebar.js'
  }
];

export const useBookmarklets = () => {
  // State to store the loaded bookmarklets with code
  const [loadedBookmarklets, setLoadedBookmarklets] = useState<Bookmarklet[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Load the bookmarklet code on component mount
  useEffect(() => {
    const loadBookmarkletCode = async () => {
      setLoading(true);
      
      try {
        const bookmarkletsWithCode = await Promise.all(
          discordBookmarkletsMeta.map(async (meta) => {
            // Build path relative to public folder
            // React's public folder is automatically available at runtime
            const fullPath = `${window.location.origin}/bookmarklets${meta.filePath.split('/bookmarklets')[1]}`;
            
            try {
              // Load the code from the file
              const code = await loadFile(fullPath);
              
              // Add javascript: prefix for bookmarklet format and ensure URL encoding
              // First ensure there are no unencoded spaces, line breaks or other characters that could break the URL
              const encodedCode = encodeURIComponent(code).replace(/%20/g, ' ');
              const bookmarkletCode = `javascript:${encodedCode}`;
              
              return {
                ...meta,
                code: bookmarkletCode
              };
            } catch (error) {
              console.error(`Error loading bookmarklet ${meta.id}:`, error);
              // Return with placeholder code on error
              return {
                ...meta,
                code: `javascript:alert('Error loading ${meta.name} bookmarklet')` 
              };
            }
          })
        );
        
        setLoadedBookmarklets(bookmarkletsWithCode);
      } catch (error) {
        console.error('Error loading bookmarklets:', error);
      } finally {
        setLoading(false);
      }
    };
    
    loadBookmarkletCode();
  }, []);

  const getBookmarklets = useCallback(() => {
    if (loading || loadedBookmarklets.length === 0) {
      // During development/testing, return metadata with placeholder code
      return discordBookmarkletsMeta.map(meta => ({
        ...meta,
        code: `javascript:alert('Loading ${meta.name}...')` 
      }));
    }
    return loadedBookmarklets;
  }, [loading, loadedBookmarklets]);

  const getBookmarkletInstruction = useCallback((bookmarklet: Bookmarklet) => {
    // Returns instruction for how to use this bookmarklet
    return `To use the "${bookmarklet.name}" bookmarklet:\n
    1. Create a new bookmark in your browser
    2. Name it "${bookmarklet.name}"
    3. In the URL field, paste the provided code
    4. Save the bookmark
    5. When using Discord, click the bookmark to activate its functionality`;
  }, []);

  const getBookmarkletCode = useCallback((id: string) => {
    const bookmarklet = loadedBookmarklets.find(b => b.id === id) || 
      discordBookmarkletsMeta.find(b => b.id === id);
    
    if (!bookmarklet) return null;
    
    // If we have a loaded bookmarklet with code, return that
    if ('code' in bookmarklet) return (bookmarklet as Bookmarklet).code;
    
    // Otherwise return placeholder
    return `javascript:alert('Loading ${bookmarklet.name}...')`;
  }, [loadedBookmarklets]);

  return {
    getBookmarklets,
    getBookmarkletInstruction,
    getBookmarkletCode,
    loading
  };
};
