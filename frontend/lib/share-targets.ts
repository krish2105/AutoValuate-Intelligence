/**
 * Sending things out of the app — WhatsApp first, because this is the UAE.
 *
 * WhatsApp is the default channel for buying and selling a used car here: the negotiation
 * happens in a chat, not over email. The app already generated the exact text a seller needs
 * (negotiation script, listing copy, valuation link) and then dead-ended at "Copy" — leaving
 * the user to paste it themselves. This closes that gap.
 *
 * WHY NOT JUST A wa.me LINK EVERYWHERE
 * On mobile, `navigator.share()` opens the OS share sheet — WhatsApp is in it, alongside
 * Telegram, Messages, Mail and whatever else the user actually has. It is one tap, it does not
 * leave the app, and it respects the user's real habits. wa.me is the right fallback (desktop,
 * and browsers without Web Share), not the right default.
 *
 * Everything here is a user-gesture action: `navigator.share()` throws outside one, so these
 * must only ever be called straight from a click handler.
 */

/**
 * WhatsApp truncates very long `?text=` payloads and some browsers cap URL length. Listing
 * bodies are the realistic risk. Cap well below any limit and mark the cut so the user is not
 * silently handed a half-message.
 */
const MAX_TEXT = 1800;

export interface SharePayload {
  /** Title for the OS share sheet. Ignored by wa.me, which only takes text. */
  title?: string;
  text: string;
  /** Appended after the text when present. */
  url?: string;
}

/** Pure: the exact string that gets sent, including the URL and any truncation marker. */
export function composeMessage({ text, url }: SharePayload): string {
  const body = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT).trimEnd()}…` : text;
  return url ? `${body}\n\n${url}` : body;
}

/** Pure: the wa.me deep link. `wa.me/?text=` opens WhatsApp with no recipient chosen. */
export function whatsappUrl(payload: SharePayload): string {
  return `https://wa.me/?text=${encodeURIComponent(composeMessage(payload))}`;
}

/**
 * Pure: which target to use. Split out from the side effect so the routing rule is unit-tested
 * rather than only observable by opening a real share sheet.
 */
export function pickTarget(hasWebShare: boolean): "web-share" | "whatsapp" {
  return hasWebShare ? "web-share" : "whatsapp";
}

export type ShareOutcome = "shared" | "whatsapp" | "cancelled" | "failed";

/**
 * Send `payload`. Returns what actually happened so the caller can show honest feedback
 * instead of claiming success on a cancelled share sheet.
 */
export async function share(payload: SharePayload): Promise<ShareOutcome> {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const hasWebShare = typeof nav?.share === "function";

  if (pickTarget(hasWebShare) === "web-share") {
    try {
      await nav!.share({
        title: payload.title,
        text: composeMessage({ text: payload.text }),
        url: payload.url,
      });
      return "shared";
    } catch (e) {
      // AbortError == the user dismissed the sheet. That is a choice, not a failure, and must
      // not fall through to yanking them into WhatsApp against their wishes.
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      // Anything else (permission, unsupported payload) — fall through to WhatsApp.
    }
  }

  const win = typeof window === "undefined" ? null : window.open(whatsappUrl(payload), "_blank", "noopener,noreferrer");
  return win ? "whatsapp" : "failed";
}
