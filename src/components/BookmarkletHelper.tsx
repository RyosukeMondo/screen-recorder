import React, { useState } from 'react';
import { useBookmarklets } from '../services/bookmarklet.service';
import type { Bookmarklet } from '../services/bookmarklet.service';
import './BookmarkletHelper.css';

/**
 * BookmarkletHelper component
 * Displays Discord Sidebar Toggle bookmarklet and provides installation instructions
 */
const BookmarkletHelper: React.FC = () => {
  // Get bookmarklets from service
  const { getBookmarklets, getBookmarkletInstruction } = useBookmarklets();
  
  // Component state
  const [selectedBookmarklet, setSelectedBookmarklet] = useState<Bookmarklet | null>(null);
  const [showInstructions, setShowInstructions] = useState(false);
  const [copySuccess, setCopySuccess] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  // Get bookmarklets and handle possible errors
  const bookmarklets = getBookmarklets();

  /**
   * Handle click on bookmarklet to show instructions
   */
  const handleBookmarkletClick = (bookmarklet: Bookmarklet) => {
    setSelectedBookmarklet(bookmarklet);
    setShowInstructions(true);
    setError(null); // Clear any previous errors
  };
  
  /**
   * Copy bookmarklet code to clipboard
   */
  const copyToClipboard = (text: string) => {
    // Validate text before copying
    if (!text || !text.trim()) {
      setError('Error: Cannot copy empty bookmarklet code');
      setCopySuccess('');
      return;
    }

    navigator.clipboard.writeText(text)
      .then(() => {
        setCopySuccess('Copied!');
        setError(null); // Clear any previous errors
        setTimeout(() => setCopySuccess(''), 2000);
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        setCopySuccess('');
        setError(`Failed to copy: ${err.message || 'Unknown error'}`); 
      });
  };

  /**
   * Close instruction modal
   */
  const closeInstructions = () => {
    setShowInstructions(false);
    setError(null); // Clear any errors when closing
  };

  return (
    <div className="bookmarklet-helper">
      <h3>Discord Privacy Tools</h3>
      <p className="helper-description">Protect your private Discord information during screen recording</p>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <div className="bookmarklet-list">
        {bookmarklets.map((bookmarklet) => (
          <div key={bookmarklet.id} className="bookmarklet-item">
            <div className="bookmarklet-info">
              <h4>{bookmarklet.name}</h4>
              <p>{bookmarklet.description}</p>
            </div>
            <div className="bookmarklet-actions">
              <button
                className="bookmarklet-drag-link"
                onClick={() => copyToClipboard(bookmarklet.code)}
              >
                Copy Bookmarklet
              </button>
              <button 
                className="bookmarklet-button"
                onClick={() => handleBookmarkletClick(bookmarklet)}
              >
                How to Use
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <div className="helper-instructions">
        <p>
          <strong>How to use:</strong> Click "Copy Bookmarklet" to copy the code to your clipboard. 
          Create a new bookmark in your browser and paste the code as the URL.
          Then when using Discord, click on the bookmark to activate the helper.
        </p>
      </div>

      {showInstructions && selectedBookmarklet && (
        <div className="instruction-modal">
          <div className="instruction-content">
            <h3>How to Add This Bookmarklet</h3>
            <div className="instruction-steps">
              <div className="installation-methods">
                <div className="drag-drop-method">
                  <h4>Option 1: Copy & Create Bookmark (Recommended)</h4>
                  <p>Click the button below to copy the bookmarklet code:</p>
                  <div className="copy-button-container">
                    <button
                      className="bookmarklet-copy-button"
                      onClick={() => selectedBookmarklet && copyToClipboard(selectedBookmarklet.code)}
                    >
                      Copy Bookmarklet Code
                    </button>
                    <span className="copy-success">{copySuccess}</span>
                  </div>
                  <p>Then create a new bookmark and paste as the URL</p>
                </div>
                
                <div className="manual-method">
                  <h4>Option 2: Manual Setup</h4>
                  <pre className="code-block">{selectedBookmarklet ? getBookmarkletInstruction(selectedBookmarklet) : ''}</pre>
                  
                  <div className="code-container">
                    <h4>Bookmarklet Code:</h4>
                    <textarea 
                      readOnly 
                      value={selectedBookmarklet?.code || ''}
                      onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                    />
                  </div>
                  
                  <p className="copy-tip">Click the code above to select all, then copy (Ctrl+C)</p>
                </div>
              </div>
            </div>
            <button className="close-button" onClick={closeInstructions}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookmarkletHelper;
