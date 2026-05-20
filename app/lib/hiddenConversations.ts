/** Returns true when a message belongs to a conversation hidden locally or on the server. */
export function isConversationHiddenForViewer(
  conversationId: string,
  localChatIds: { raw: string; resolved: string },
  hiddenLocalChatIds: ReadonlySet<string>,
  hiddenServerConversationIds: ReadonlySet<string>
): boolean {
  const encId = conversationId.trim();
  if (encId && hiddenServerConversationIds.has(encId)) return true;

  const raw = localChatIds.raw.trim();
  const resolved = localChatIds.resolved.trim();
  if (raw && hiddenLocalChatIds.has(raw)) return true;
  if (resolved && hiddenLocalChatIds.has(resolved)) return true;

  if (encId.startsWith("enc_")) {
    const fromEnc = encId.replace(/^enc_/, "");
    if (hiddenLocalChatIds.has(fromEnc)) return true;
  }

  return false;
}

/** Map server `enc_*` tombstones to local chat ids for UI persistence. */
export function localChatIdsFromHiddenConversationIds(conversationIds: string[]): string[] {
  const out = new Set<string>();
  for (const id of conversationIds) {
    const trimmed = id.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("enc_")) {
      out.add(trimmed.replace(/^enc_/, ""));
    } else {
      out.add(trimmed);
    }
  }
  return [...out];
}
