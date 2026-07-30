import type {
  ClipAnalysis,
  EditPlan,
  JobStatus,
  MusicAnalysis,
  ProjectRecord,
} from "../../../lib/contracts";

export interface StorageProvider {
  initialize(): Promise<void>;
  createProjectDirectories(projectId: string): Promise<void>;
  removeProject(projectId: string): Promise<void>;
  getUploadPath(projectId: string, storedName: string): string;
  getProjectWorkPath(projectId: string, ...parts: string[]): string;
  getRenderPath(projectId: string, renderName: string): string;
  writeProject(project: ProjectRecord): Promise<void>;
  readProject(projectId: string): Promise<ProjectRecord>;
  writeJob(job: JobStatus): Promise<void>;
  readJob(jobId: string): Promise<JobStatus>;
  writeClipAnalysis(
    projectId: string,
    analysis: ClipAnalysis[],
  ): Promise<void>;
  readClipAnalysis(projectId: string): Promise<ClipAnalysis[] | null>;
  writeMusicAnalysis(
    projectId: string,
    analysis: MusicAnalysis | null,
  ): Promise<void>;
  readMusicAnalysis(projectId: string): Promise<MusicAnalysis | null>;
  writeEditPlan(projectId: string, plan: EditPlan): Promise<void>;
  readEditPlan(projectId: string): Promise<EditPlan>;
  markInterruptedJobsFailed(): Promise<number>;
  cleanupExpired(ttlHours: number): Promise<number>;
}

/**
 * The worker depends only on this interface. A future S3, Cloudflare R2 or
 * Vercel Blob adapter can replace the local implementation without changing
 * analysis, directing or rendering.
 */
