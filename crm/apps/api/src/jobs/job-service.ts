import type { BackgroundJob, JobStatus, Prisma } from "@prisma/client";
import { Prisma as PrismaRuntime } from "@prisma/client";
import { prisma } from "../lib/db.js";

export type EnqueueJobInput = {
  storeId?: string | null;
  jobType: string;
  entityType?: string | null;
  entityId?: string | null;
  idempotencyKey?: string | null;
  payload?: Prisma.InputJsonObject;
  maxAttempts?: number;
  scheduledAt?: Date;
};

export async function enqueueJob(input: EnqueueJobInput) {
  if (input.idempotencyKey) {
    const existing = await prisma.backgroundJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing) {
      return { job: existing, created: false };
    }
  }

  let job: BackgroundJob;
  try {
    job = await prisma.backgroundJob.create({
      data: {
        storeId: input.storeId,
        jobType: input.jobType,
        entityType: input.entityType,
        entityId: input.entityId,
        idempotencyKey: input.idempotencyKey,
        payload: input.payload,
        maxAttempts: input.maxAttempts ?? 3,
        scheduledAt: input.scheduledAt ?? new Date(),
      },
    });
  } catch (error) {
    if (input.idempotencyKey && error instanceof PrismaRuntime.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.backgroundJob.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });

      if (existing) {
        return { job: existing, created: false };
      }
    }

    throw error;
  }

  await prisma.jobExecutionLog.create({
    data: {
      storeId: input.storeId,
      jobId: job.id,
      status: "QUEUED",
      message: "Job enfileirado.",
      metadata: {
        jobType: input.jobType,
        entityType: input.entityType,
        entityId: input.entityId,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });

  return { job, created: true };
}

export async function markJobFailed(input: {
  jobId: string;
  storeId?: string | null;
  error: string;
  metadata?: Prisma.InputJsonObject;
}) {
  const job = await prisma.backgroundJob.update({
    where: { id: input.jobId },
    data: {
      status: "FAILED",
      attempts: { increment: 1 },
      lastError: input.error,
      finishedAt: new Date(),
    },
  });

  await prisma.jobExecutionLog.create({
    data: {
      storeId: input.storeId,
      jobId: input.jobId,
      status: "FAILED",
      message: input.error,
      metadata: input.metadata,
    },
  });

  return job;
}

export async function requeueFailedJob(input: { jobId: string; storeId?: string | null; requestedByUserId?: string }) {
  const job = await prisma.backgroundJob.findFirst({
    where: {
      id: input.jobId,
      storeId: input.storeId,
    },
  });

  if (!job || job.status !== "FAILED") {
    return null;
  }

  const nextJob = await prisma.backgroundJob.update({
    where: { id: job.id },
    data: {
      status: "QUEUED",
      scheduledAt: new Date(),
      startedAt: null,
      finishedAt: null,
      lastError: null,
    },
  });

  await prisma.jobExecutionLog.create({
    data: {
      storeId: input.storeId,
      jobId: job.id,
      status: "QUEUED",
      message: "Job reenfileirado manualmente.",
      metadata: {
        requestedByUserId: input.requestedByUserId,
        previousAttempts: job.attempts,
      },
    },
  });

  return nextJob;
}

export function serializeJob(job: {
  id: string;
  storeId: string | null;
  jobType: string;
  status: JobStatus;
  entityType: string | null;
  entityId: string | null;
  idempotencyKey: string | null;
  attempts: number;
  maxAttempts: number;
  payload: Prisma.JsonValue | null;
  result: Prisma.JsonValue | null;
  lastError: string | null;
  scheduledAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: job.id,
    storeId: job.storeId,
    jobType: job.jobType,
    status: job.status,
    entityType: job.entityType,
    entityId: job.entityId,
    idempotencyKey: job.idempotencyKey,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    payload: job.payload,
    result: job.result,
    lastError: job.lastError,
    scheduledAt: job.scheduledAt.toISOString(),
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
  };
}
