import { isAndroidChromeBrowser } from "@/lib/mobile/chrome-android-safe-mode"

/** Delay before Supabase realtime + heavy chat fetches on low-end Chrome Android. */
export const CHAT_REALTIME_DELAY_MS = 500

/** Frames to wait after selecting Chat tab before mounting the chat chunk. */
export const CHAT_CHUNK_MOUNT_DELAY_MS = 120

const CHAT_CHUNK_MOUNT_DELAY_CHROME_ANDROID_MS = 320

export function getChatChunkMountDelayMs(): number {
  if (typeof window === "undefined") return CHAT_CHUNK_MOUNT_DELAY_MS
  return isAndroidChromeBrowser() ? CHAT_CHUNK_MOUNT_DELAY_CHROME_ANDROID_MS : CHAT_CHUNK_MOUNT_DELAY_MS
}
