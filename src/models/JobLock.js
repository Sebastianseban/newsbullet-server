import mongoose from "mongoose";

const jobLockSchema = new mongoose.Schema(
  {
    jobName: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    ownerId: {
      type: String,
      required: true,
      trim: true,
    },
    lockedUntil: {
      type: Date,
      required: true,
      index: true,
    },
  },
  { timestamps: true }
);

const JobLock = mongoose.model("JobLock", jobLockSchema);

export default JobLock;
