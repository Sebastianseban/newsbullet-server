export const withTimeout = async (promise, ms = 10000) => {
  let timeout;

  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("Request timed out"));
    }, ms);
    timeout.unref?.();
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timeout);
  }
};
