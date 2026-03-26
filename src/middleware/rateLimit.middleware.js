const getKey = (req) => req.ip || req.headers["x-forwarded-for"] || "unknown";

export const createRateLimiter = ({
  windowMs = 60 * 1000,
  max = 60,
  message = "Too many requests. Please try again later.",
} = {}) => {
  const store = new Map();
  const timer = setInterval(() => {
    const now = Date.now();

    for (const [key, value] of store.entries()) {
      if (value.expiresAt <= now) {
        store.delete(key);
      }
    }
  }, windowMs);

  timer.unref?.();

  return (req, res, next) => {
    const now = Date.now();
    const key = getKey(req);
    const current = store.get(key);

    if (!current || current.expiresAt <= now) {
      store.set(key, {
        count: 1,
        expiresAt: now + windowMs,
      });
      return next();
    }

    current.count += 1;

    if (current.count > max) {
      const retryAfter = Math.ceil((current.expiresAt - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      return res.status(429).json({
        success: false,
        message,
      });
    }

    return next();
  };
};
