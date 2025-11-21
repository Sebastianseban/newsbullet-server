// ============================================
// models/Subscription.js
// ============================================

import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subscriptionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    planId: {
      type: String,
      required: true,
      index: true,
    },
    customerId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "created",
        "authenticated",
        "active",
        "pending",
        "halted",
        "cancelled",
        "completed",
        "expired",
        "paused",
        "pending_cancellation",
        "failed",
      ],
      default: "created",
      index: true,
    },
    totalCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    paidCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    remainingCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    currentStart: {
      type: Date,
      index: true,
    },
    currentEnd: {
      type: Date,
      index: true,
    },
    startAt: {
      type: Date,
    },
    endAt: {
      type: Date,
      index: true,
    },
    chargeAt: {
      type: Date,
      index: true,
    },
    lastChargedAt: {
      type: Date,
    },
    lastPaymentId: {
      type: String,
    },
    lastFailedPaymentId: {
      type: String,
    },
    lastFailedAt: {
      type: Date,
    },
    failureReason: {
      type: String,
    },
    activatedAt: {
      type: Date,
    },
    cancelledAt: {
      type: Date,
    },
    pausedAt: {
      type: Date,
    },
    resumedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    haltedAt: {
      type: Date,
    },
    notes: {
      type: Map,
      of: String,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for better query performance
subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ userId: 1, planId: 1 });
subscriptionSchema.index({ customerId: 1, status: 1 });
subscriptionSchema.index({ createdAt: -1 });

// ============================================
// INSTANCE METHODS
// ============================================

/**
 * Check if subscription is currently active
 */
subscriptionSchema.methods.isActive = function () {
  return this.status === "active";
};

/**
 * Check if subscription can be cancelled
 */
subscriptionSchema.methods.canCancel = function () {
  return ["active", "authenticated", "pending"].includes(this.status);
};

/**
 * Check if subscription can be paused
 */
subscriptionSchema.methods.canPause = function () {
  return this.status === "active";
};

/**
 * Check if subscription can be resumed
 */
subscriptionSchema.methods.canResume = function () {
  return this.status === "paused";
};

/**
 * Check if subscription is in a terminal state
 */
subscriptionSchema.methods.isTerminal = function () {
  return ["cancelled", "completed", "expired"].includes(this.status);
};

/**
 * Get days until next charge
 */
subscriptionSchema.methods.getDaysUntilNextCharge = function () {
  if (!this.chargeAt) return null;
  const now = new Date();
  const diffTime = this.chargeAt - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Get days until subscription ends
 */
subscriptionSchema.methods.getDaysUntilEnd = function () {
  if (!this.endAt) return null;
  const now = new Date();
  const diffTime = this.endAt - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

/**
 * Check if subscription is about to expire
 */
subscriptionSchema.methods.isExpiringSoon = function (days = 7) {
  const daysUntilEnd = this.getDaysUntilEnd();
  return daysUntilEnd !== null && daysUntilEnd <= days && daysUntilEnd > 0;
};

// ============================================
// STATIC METHODS
// ============================================

/**
 * Find all active subscriptions for a user
 */
subscriptionSchema.statics.findActiveByUser = function (userId) {
  return this.find({
    userId,
    status: "active",
  }).sort({ createdAt: -1 });
};

/**
 * Find active subscription for a specific plan
 */
subscriptionSchema.statics.findActiveByUserAndPlan = function (userId, planId) {
  return this.findOne({
    userId,
    planId,
    status: { $in: ["created", "authenticated", "active", "pending"] },
  });
};

/**
 * Find subscriptions expiring within specified days
 */
subscriptionSchema.statics.findExpiring = function (days = 7) {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return this.find({
    status: "active",
    endAt: {
      $gte: now,
      $lte: futureDate,
    },
  }).populate("userId", "name email");
};

/**
 * Find subscriptions that need charge reminder
 */
subscriptionSchema.statics.findNeedingChargeReminder = function (days = 3) {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return this.find({
    status: "active",
    chargeAt: {
      $gte: now,
      $lte: futureDate,
    },
  }).populate("userId", "name email");
};

/**
 * Get subscription statistics for a user
 */
subscriptionSchema.statics.getUserStats = async function (userId) {
  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
      },
    },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  return stats.reduce((acc, stat) => {
    acc[stat._id] = stat.count;
    return acc;
  }, {});
};

/**
 * Find halted subscriptions (payment failures)
 */
subscriptionSchema.statics.findHalted = function () {
  return this.find({
    status: "halted",
  }).populate("userId", "name email phone");
};

/**
 * Clean up old completed/cancelled subscriptions
 */
subscriptionSchema.statics.cleanupOldSubscriptions = function (daysOld = 365) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  return this.deleteMany({
    status: { $in: ["completed", "cancelled", "expired"] },
    updatedAt: { $lt: cutoffDate },
  });
};

// ============================================
// VIRTUALS
// ============================================

/**
 * Virtual for checking if subscription is in trial
 */
subscriptionSchema.virtual("isInTrial").get(function () {
  return this.paidCount === 0 && this.status === "active";
});

/**
 * Virtual for subscription duration in days
 */
subscriptionSchema.virtual("durationInDays").get(function () {
  if (!this.startAt || !this.endAt) return null;
  const diffTime = this.endAt - this.startAt;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Pre-save middleware to calculate remaining count
 */
subscriptionSchema.pre("save", function (next) {
  if (typeof this.totalCount === "number" && typeof this.paidCount === "number") {
    const diff = this.totalCount - this.paidCount;
    this.remainingCount = diff >= 0 ? diff : 0;
  }
  next();
});

/**
 * Pre-update middleware for validation
 */
subscriptionSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();

  // Ensure dates are valid
  if (update && update.$set) {
    const dateFields = [
      "currentStart",
      "currentEnd",
      "startAt",
      "endAt",
      "chargeAt",
    ];

    dateFields.forEach((field) => {
      if (update.$set[field] && !(update.$set[field] instanceof Date)) {
        update.$set[field] = new Date(update.$set[field]);
      }
    });
  }

  next();
});

// ============================================
// INDEXES FOR PRODUCTION
// ============================================

// Index for finding subscriptions to charge soon
subscriptionSchema.index({ status: 1, chargeAt: 1 });

// Index for finding expired subscriptions
subscriptionSchema.index({ status: 1, endAt: 1 });

// Index for customer lookups
subscriptionSchema.index({ customerId: 1, createdAt: -1 });

const Subscription = mongoose.model("Subscription", subscriptionSchema);

export default Subscription;
