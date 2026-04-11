import { randomUUID } from "node:crypto";
import { logger } from "../utils/logger.js";
import { requestStore } from "../utils/requestContext.js";

const SKIP_ACCESS_LOG_PATHS = new Set(["/livez", "/readyz"]);

/**
 * Assigns X-Request-Id, runs handlers inside AsyncLocalStorage (auto requestId on logs),
 * and logs one line per HTTP response (status, duration).
 */
export function requestContextMiddleware(req, res, next) {
  const headerId = req.headers["x-request-id"];
  const requestId =
    typeof headerId === "string" && headerId.length > 0
      ? headerId.slice(0, 128)
      : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const start = Date.now();
  const path = req.path || req.url?.split("?")[0] || "";
  const skipAccessLog = SKIP_ACCESS_LOG_PATHS.has(path);

  let accessLogged = false;
  const onDone = () => {
    if (accessLogged) {
      return;
    }
    accessLogged = true;
    res.removeListener("finish", onDone);
    res.removeListener("close", onDone);
    if (skipAccessLog && res.statusCode < 400) {
      return;
    }
    const durationMs = Date.now() - start;
    const logPayload = {
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode: res.statusCode,
      durationMs,
    };
    if (res.statusCode >= 500) {
      logger.error(logPayload, "http_request");
    } else if (res.statusCode >= 400) {
      logger.warn(logPayload, "http_request");
    } else {
      logger.info(logPayload, "http_request");
    }
  };

  res.on("finish", onDone);
  res.on("close", onDone);

  requestStore.run({ requestId }, () => {
    next();
  });
}
