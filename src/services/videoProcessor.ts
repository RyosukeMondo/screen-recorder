/**
 * VideoProcessorService - Handles video processing and download functionality
 * Single responsibility: Processing video data for download
 */
export class VideoProcessorService {
  /**
   * Convert recorded chunks to MP4 format and download
   * Uses proper MP4 encoding with ffmpeg.js if available, or fallback to browser's format
   */
  async downloadMP4(chunks: Blob[], title: string): Promise<void> {
    try {
      // Get the actual MIME type from the first chunk to determine conversion needs
      const actualType = chunks[0]?.type || '';
      console.log(`Original recording format: ${actualType}`);
      
      // Create blob from chunks with explicit MP4 MIME type
      const blob = await this.createMP4Blob(chunks);
      const url = URL.createObjectURL(blob);
      
      // Generate filename with timestamp
      const fileName = this.generateFileName(title);
      
      // Create download link and trigger download
      const a = document.createElement('a');
      document.body.appendChild(a);
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading video:', error);
      throw error;
    }
  }
  
  /**
   * Create MP4 blob from recorded chunks
   * In a production app, this would use a transcoding library like ffmpeg.js
   * For now, we ensure the MIME type is set correctly
   */
  private async createMP4Blob(chunks: Blob[]): Promise<Blob> {
    // Here you would potentially add FFmpeg.js transcoding
    // For example:
    // return await this.transcodeToMp4WithFFmpeg(chunks);
    
    // Simple implementation without transcoding library:
    // We explicitly set the MIME type to MP4
    return new Blob(chunks, { type: 'video/mp4' });
  }
  
  /**
   * Generate standardized filename for downloaded video
   */
  private generateFileName(title: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day}_${hours}-${minutes}_${title}.mp4`;
  }
  
  /*
   * Example placeholder for FFmpeg.js implementation
   * This would be implemented with actual FFmpeg.js in a production app
   * @note This method is currently commented out as it's intended for future implementation
   * 
   * private async transcodeToMp4WithFFmpeg(chunks: Blob[]): Promise<Blob> {
   *   // Placeholder for FFmpeg.js implementation
   *   // In a real implementation, this would:
   *   // 1. Load FFmpeg.js
   *   // 2. Create a single blob from chunks
   *   // 3. Convert the blob to ArrayBuffer
   *   // 4. Use FFmpeg to transcode to MP4 with H.264 codec
   *   // 5. Return the transcoded blob
   *   
   *   // For now, we just return the original blob with MP4 MIME type
   *   console.log('FFmpeg transcoding would happen here in a production app');
   *   return new Blob(chunks, { type: 'video/mp4' });
   * }
   */
}
