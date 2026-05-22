/**
 * Websocket-ready revision broadcast (polling today; push later without hook redesign).
 */

type RevisionListener = (revision: number) => void

const revisionListeners = new Set<RevisionListener>()

export function subscribeAuthorityRevision(listener: RevisionListener): () => void {
  revisionListeners.add(listener)
  return () => revisionListeners.delete(listener)
}

export function broadcastAuthorityRevision(revision: number) {
  for (const fn of revisionListeners) {
    try {
      fn(revision)
    } catch {
      /* subscriber error */
    }
  }
}
