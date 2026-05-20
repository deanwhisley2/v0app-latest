import toast from "react-hot-toast"

export type MutationApiErrorJson = {
  success?: boolean
  error_code?: string
  user_message?: string
  technical_message?: string
  context?: Record<string, unknown>
}

export function toastMutationError(json: unknown, fallbackUserMessage: string, duration = 7000) {
  const j = json as MutationApiErrorJson & { error?: string; message?: string }
  if (j && typeof j === "object") {
    const um = typeof j.user_message === "string" ? j.user_message.trim() : ""
    if (um) {
      toast.error(um, { duration })
      return
    }
    const legacy = typeof j.error === "string" ? j.error.trim() : ""
    if (legacy) {
      toast.error(legacy, { duration })
      return
    }
    const msg = typeof j.message === "string" ? j.message.trim() : ""
    if (msg) {
      toast.error(msg, { duration })
      return
    }
  }
  toast.error(fallbackUserMessage, { duration })
}

export function toastMutationSuccess(message: string, duration = 5000) {
  toast.success(message, { duration })
}

/** Parse JSON from fetch; returns null if invalid. */
export async function readJsonSafe(res: Response): Promise<unknown> {
  try {
    return await res.json()
  } catch {
    return null
  }
}
