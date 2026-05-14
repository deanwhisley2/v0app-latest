import toast from "react-hot-toast"

export type MutationApiErrorJson = {
  success?: boolean
  error_code?: string
  user_message?: string
  technical_message?: string
  context?: Record<string, unknown>
}

export function toastMutationError(json: unknown, fallbackUserMessage: string, duration = 7000) {
  const j = json as MutationApiErrorJson
  if (j && j.success === false && typeof j.user_message === "string" && j.user_message.trim()) {
    toast.error(j.user_message.trim(), { duration })
    return
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
