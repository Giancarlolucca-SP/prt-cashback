/**
 * Thin bridge between the axios interceptors (client.ts) and the
 * NetworkContext React component tree.
 *
 * client.ts cannot import React context, so it calls the setters here.
 * NetworkContext registers its setState callback on mount.
 */

type OnlineListener = (online: boolean) => void;

let _listener: OnlineListener | null = null;

export const networkStatus = {
  /** Called once by NetworkProvider to register its setState. */
  register(fn: OnlineListener) {
    _listener = fn;
  },
  /** Signal that a network request succeeded (we are online). */
  setOnline() {
    _listener?.(true);
  },
  /** Signal that a request failed with no response (we are offline). */
  setOffline() {
    _listener?.(false);
  },
};
