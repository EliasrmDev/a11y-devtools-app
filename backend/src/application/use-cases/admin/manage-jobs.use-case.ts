import type { JobQueue, BackgroundJob, JobName } from "../../../infrastructure/jobs/job-queue.js";
import type { AuditRepository } from "../../../domain/ports/audit.repository.js";

export interface JobListResult {
  data: BackgroundJob[];
}

export class ManageJobsUseCase {
  constructor(
    private readonly jobQueue: JobQueue,
    private readonly audit: AuditRepository,
  ) {}

  async listJobs(filter?: { name?: string; status?: string }): Promise<JobListResult> {
    const data = await this.jobQueue.list(filter);
    return { data };
  }

  /**
   * Sets all pending jobs with the given name to run immediately.
   * If none exist, enqueues a fresh one.
   */
  async runJobNow(
    name: JobName,
    adminUserId: string,
    meta?: { ipAddress?: string; userAgent?: string },
  ): Promise<void> {
    const updated = await this.jobQueue.runNow(name);

    // If no pending jobs existed, enqueue a fresh one
    if (updated === 0) {
      await this.jobQueue.enqueue(name, {});
    }

    await this.audit.create({
      userId: adminUserId,
      action: "admin.job.run",
      resourceType: "background_job",
      resourceId: name,
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
  }
}
