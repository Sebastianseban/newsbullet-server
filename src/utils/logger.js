import dotenv from "dotenv";
import pino from "pino";
import { getRequestContext } from "./requestContext.js";

dotenv.config();

const nodeEnv = process.env.NODE_ENV || "development";
const isProd = nodeEnv === "production";
const level =
  process.env.LOG_LEVEL ||
  (isProd ? "info" : "debug");

const baseOptions = {
  level,
  mixin() {
    const ctx = getRequestContext();
    return ctx?.requestId ? { requestId: ctx.requestId } : {};
  },
};

/** Root logger: JSON in production (CloudWatch, Datadog, etc.), pretty in dev */
export const logger =
  isProd
    ? pino(baseOptions)
    : pino({
        ...baseOptions,
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      });
