import type { VideoData, VideoInfo } from '../types/recording';

/**
 * StorageService - Handles IndexedDB operations for video storage
 * Single responsibility: Managing video data persistence
 */
export class StorageService {
  private readonly dbName: string = 'screenRecordingsDB';
  private readonly dbVersion: number = 1;
  private readonly storeName: string = 'videos';
  
  /**
   * Open IndexedDB database
   */
  private async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onsuccess = (event) => {
        resolve((event.target as IDBOpenDBRequest).result);
      };
      
      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }
  
  /**
   * Save video to IndexedDB
   */
  async saveVideo(chunks: Blob[], videoInfo: VideoInfo): Promise<void> {
    try {
      // Clone chunks to avoid issues with structured cloning
      const chunksClone = chunks.map(chunk => chunk);
      
      // Open database
      const db = await this.openDatabase();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      // Create video data object with videoId used as the id property
      const videoData: VideoData = {
        id: videoInfo.videoId,
        datetime: videoInfo.beginTime,
        title: videoInfo.title,
        chunks: chunksClone
      };
      
      // Add to store
      const request = store.add(videoData);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          resolve();
        };
        
        request.onerror = () => {
          reject(request.error);
        };
        
        // Wait for transaction to complete
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        
        transaction.onerror = () => {
          reject(transaction.error);
        };
      });
    } catch (error) {
      console.error('Error saving to IndexedDB:', error);
      throw error;
    }
  }
  
  /**
   * Get all stored videos metadata
   */
  async getAllVideos(): Promise<VideoData[]> {
    try {
      const db = await this.openDatabase();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          db.close();
          resolve(request.result);
        };
        
        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error getting videos from IndexedDB:', error);
      return [];
    }
  }
  
  /**
   * Get a single video by ID
   */
  async getVideo(videoId: string): Promise<VideoData | null> {
    try {
      const db = await this.openDatabase();
      const transaction = db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(videoId);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          db.close();
          resolve(request.result || null);
        };
        
        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error getting video from IndexedDB:', error);
      return null;
    }
  }
  
  /**
   * Remove video from IndexedDB
   */
  async removeVideo(videoId: string): Promise<void> {
    try {
      const db = await this.openDatabase();
      const transaction = db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(videoId);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => {
          db.close();
          resolve();
        };
        
        request.onerror = () => {
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('Error removing video from IndexedDB:', error);
      throw error;
    }
  }
}
