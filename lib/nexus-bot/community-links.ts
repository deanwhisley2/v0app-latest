/**
 * Centralized community links for signal messages.
 * Single source of truth — update one place, all messages reflect.
 */

export const COMMUNITY_LINKS = {
  telegramChannel: "https://t.me/nexusprocryptointel",
  whatsappGroup: "https://chat.whatsapp.com/GH3tSCYOQf8C4UldGDBLBf",
  whatsappChannel: "https://whatsapp.com/channel/0029VbCX8n61SWt0e9a0L80p",
  screenshotGroup: "https://chat.whatsapp.com/GtBKzg2XxJ7IKfLGesAzzb",
} as const

export function buildCommunityBlock(): string {
  return [
    `🌍 *JOIN THE NEXUS PRO NETWORK*`,
    ``,
    `📢 Telegram Channel: ${COMMUNITY_LINKS.telegramChannel}`,
    `💬 WhatsApp Group: ${COMMUNITY_LINKS.whatsappGroup}`,
    `📣 WhatsApp Channel: ${COMMUNITY_LINKS.whatsappChannel}`,
  ].join("\n")
}
