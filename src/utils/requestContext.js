import { AsyncLocalStorage } from "node:async_hooks";

/** Per-request context for correlating logs (requestId). */
export const requestStore = new AsyncLocalStorage();

export function getRequestContext() {
  return requestStore.getStore();
}
