import React, { useState } from 'react';
import './Instructions.css';

/**
 * Instructions component to show user guidance in different languages
 * Includes language tab selection and mic usage guidance
 */
const Instructions: React.FC = () => {
  const [language, setLanguage] = useState<'en' | 'ja'>('en');

  // English instructions content
  const enContent = {
    title: 'How to Use:',
    steps: [
      'Click "Start Recording"',
      'Choose what you want to share (screen, window, or tab)',
      'Click "Stop Recording" when finished',
      'WebM file will download immediately',
      'MP4 conversion will start automatically',
    ],
    note: 'Note: Keep this tab open while recording. Closing or navigating away will stop the recording.',
    microphoneTitle: 'Microphone:',
    microphoneInfo: [
      'If you are a streamer, you need to include microphone.',
      'If you are only recording support content, no microphone is needed.'
    ]
  };

  // Japanese instructions content
  const jaContent = {
    title: '使い方：',
    steps: [
      '「録画開始」をクリック',
      '共有したいもの（画面、ウィンドウ、またはタブ）を選択',
      '録画完了後「録画終了」をクリック',
      'WebMファイルが自動的にダウンロードされます',
      'MP4への変換が自動的に開始されます',
    ],
    note: '注意：録画中はこのタブを開いたままにしてください。閉じたり移動したりすると録画が停止します。',
    microphoneTitle: 'マイクについて：',
    microphoneInfo: [
      'ストリーマーの場合はマイクを含める必要があります。',
      '録画サポートのみの場合はマイクは必要ありません。'
    ]
  };

  // Get current content based on selected language
  const currentContent = language === 'en' ? enContent : jaContent;

  return (
    <div className="instructions">
      <div className="language-tabs">
        <button 
          className={`tab ${language === 'en' ? 'active' : ''}`}
          onClick={() => setLanguage('en')}
        >
          English
        </button>
        <button 
          className={`tab ${language === 'ja' ? 'active' : ''}`}
          onClick={() => setLanguage('ja')}
        >
          日本語
        </button>
      </div>

      <div className="instructions-content">
        <h3>{currentContent.title}</h3>
        <ol>
          {currentContent.steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
        <p className="note">{currentContent.note}</p>
        
        <h4>{currentContent.microphoneTitle}</h4>
        <ul className="mic-instructions">
          {currentContent.microphoneInfo.map((info, index) => (
            <li key={index}>{info}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Instructions;
