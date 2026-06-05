import type { ReactNode } from "react";

import type { Message } from "../domain/types";
import type { TierBResolvePriority } from "../lib/tierBMedia/storage";
import { useResolvedMediaUri } from "../hooks/useResolvedMediaUri";

export function ChatMessageMediaResolver(props: {
  message: Message;
  /** When false, Tier B decrypt/download is deferred (legacy URIs still resolve immediately). */
  resolveEnabled?: boolean;
  /** User-initiated playback should jump ahead of background decrypt work. */
  resolvePriority?: TierBResolvePriority;
  children: (resolvedUri: string | undefined, resolving: boolean) => ReactNode;
}): ReactNode {
  const { uri, resolving } = useResolvedMediaUri(
    props.message.mediaUri,
    props.message.mediaEncrypted,
    { enabled: props.resolveEnabled !== false, priority: props.resolvePriority ?? "normal" }
  );
  return <>{props.children(uri, resolving)}</>;
}

export function messageHasResolvableMedia(message: Message): boolean {
  return Boolean(message.mediaUri?.trim() || message.mediaEncrypted);
}
