import type { Chat, Message } from "../domain/types";



/** Standard push body preview length (chars); ellipsis when truncated. */

export const PUSH_PREVIEW_MAX_CHARS = 120;



export function truncatePushPreview(text: string, max = PUSH_PREVIEW_MAX_CHARS): string {

  const trimmed = text.trim();

  if (trimmed.length <= max) return trimmed;

  return `${trimmed.slice(0, Math.max(0, max - 1)).trimEnd()}…`;

}



export function buildMessagePushBodyPreview(message: Pick<Message, "text" | "kind">): string {

  const text = message.text?.trim();

  if (text) return truncatePushPreview(text);

  switch (message.kind) {

    case "photo":

      return "Photo";

    case "video":

      return "Video";

    case "voice":

      return "Voice note";

    case "gif":

      return "GIF";

    default:

      return "Sent a message";

  }

}



/**

 * Who the push notification should attribute the message to (recipients' perspective).

 * - 1:1 → sender's display name

 * - Group / broadcast → chat title when set

 */

export function resolveChatPushNotificationTitle(args: {

  chat: Pick<Chat, "name" | "kind" | "memberIds">;

  currentUserLocalId: string;

  senderDisplayName: string;

}): string {

  const trimmedName = args.chat.name?.trim();

  if (args.chat.kind === "broadcast") {

    return trimmedName || "Broadcast";

  }



  const others = args.chat.memberIds.filter((id) => id !== args.currentUserLocalId);

  if (others.length > 1) {

    return trimmedName || "Group chat";

  }



  const senderName = args.senderDisplayName.trim();

  if (senderName) return senderName;

  return trimmedName || "Someone";

}



export function buildChatMessagePushCopy(args: {

  chat: Pick<Chat, "name" | "kind" | "memberIds">;

  message: Pick<Message, "text" | "kind">;

  currentUserLocalId: string;

  senderDisplayName: string;

}): { title: string; body: string } {

  const titleName = resolveChatPushNotificationTitle(args);

  return {

    title: `New message from ${titleName}`,

    body: buildMessagePushBodyPreview(args.message),

  };

}



export function buildNewPostPushCopy(authorName: string): { title: string; body: string } {

  const name = authorName.trim() || "Someone";

  return {

    title: `New post from ${name}`,

    body: `${name} shared a new post`,

  };

}


