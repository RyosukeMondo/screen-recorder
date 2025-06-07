/**
 * Types for screen recording functionality
 */

/**
 * Options for starting a recording
 */
export interface RecordingOptions {
  video: boolean;
  audio: boolean;
}

/**
 * Video metadata
 */
export interface VideoInfo {
  videoId: string;
  beginTime: string;
  title: string;
}

/**
 * Video data stored in IndexedDB
 */
export interface VideoData {
  id: string;
  datetime: string;
  title: string;
  chunks?: Blob[];
}
