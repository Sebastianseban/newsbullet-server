import JobLock from "../models/JobLock.js";

const DEFAULT_LOCK_TTL_MS = 15 * 60 * 1000;

export const acquireJobLock = async ({
  jobName,
  ownerId,
  ttlMs = DEFAULT_LOCK_TTL_MS,
}) => {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + ttlMs);

  let lock;

  try {
    lock = await JobLock.findOneAndUpdate(
      {
        jobName,
        $or: [{ lockedUntil: { $lte: now } }, { ownerId }],
      },
      {
        $set: {
          jobName,
          ownerId,
          lockedUntil,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      }
    ).lean();
  } catch (error) {
    if (error?.code === 11000) {
      return false;
    }

    throw error;
  }

  return Boolean(lock && lock.ownerId === ownerId);
};

export const releaseJobLock = async ({ jobName, ownerId }) => {
  await JobLock.deleteOne({ jobName, ownerId });
};
