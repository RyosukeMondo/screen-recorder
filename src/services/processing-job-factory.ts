import { EncodingJob } from './encoding-job';
import type { ProgressCallback, CancellationCallback } from './encoding-job';

/**
 * ProcessingJobFactory - Creates isolated encoding job instances
 * Single responsibility: Creating and tracking encoding job instances
 */
export class ProcessingJobFactory {
  // Keep track of active jobs
  private activeJobs = new Set<EncodingJob>();
  
  /**
   * Create a new encoding job
   * Each job is isolated and can be cancelled/destroyed independently
   */
  public createEncodingJob(
    onProgress?: ProgressCallback, 
    onCancelled?: CancellationCallback
  ): EncodingJob {
    // Create enhanced callbacks that handle tracking and cleanup
    const enhancedCancellation: CancellationCallback = () => {
      if (onCancelled) {
        onCancelled();
      }
      
      // Auto-cleanup after job completes or is cancelled
      setTimeout(() => {
        if (job && this.activeJobs.has(job)) {
          this.activeJobs.delete(job);
          console.log('Job auto-removed from active jobs tracker');
        }
      }, 0);
    };
    
    // Create the job with our enhanced callbacks
    const job = new EncodingJob(onProgress, enhancedCancellation);
    
    // Track the job
    this.activeJobs.add(job);
    
    return job;
  }
  
  /**
   * Cancel all active jobs
   * Useful when shutting down the application
   */
  public cancelAllJobs(): void {
    console.log(`Cancelling all ${this.activeJobs.size} active jobs`);
    
    // Make a copy of the set to avoid modification during iteration
    const jobs = Array.from(this.activeJobs);
    
    // Cancel all jobs
    jobs.forEach(job => {
      try {
        job.cancel();
      } catch (error) {
        console.error('Error cancelling job:', error);
      }
    });
    
    // Clear the active jobs set
    this.activeJobs.clear();
  }
  
  /**
   * Get the number of active jobs
   */
  public getActiveJobCount(): number {
    return this.activeJobs.size;
  }
}
