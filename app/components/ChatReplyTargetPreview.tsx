import { Ionicons } from "@expo/vector-icons";
import { Image, Text, View } from "react-native";

import { useVideoPoster } from "../hooks/useVideoPosterUri";
import { chatPhotoMessageSize } from "../lib/chatMediaLayout";
import { peekDisplayMediaUri, tierBDisplayCacheKey } from "../lib/displayMediaCache";
import { getMessagePreviewBody } from "../theme/preludeConstants";
import {
  ChatMessageMediaResolver,
  messageHasResolvableMedia,
} from "./ChatMessageMediaResolver";
import type { Message } from "../domain/types";

const THUMB_MAX_W = 48;

type Props = {
  message: Message;
  textColor: string;
  subtleTextColor: string;
  accentColor: string;
  bodyStyle: object;
  metaStyle?: object;
  metaText?: string | null;
};

function ReplyVideoThumb(props: {
  uri: string;
  message: Message;
  accentColor: string;
}) {
  const { uri, message, accentColor } = props;
  const { posterUri, width, height } = useVideoPoster(uri, true);
  const layout = chatPhotoMessageSize(
    360,
    message.mediaWidth ?? width,
    message.mediaHeight ?? height,
    9 / 16
  );
  const scale = THUMB_MAX_W / Math.max(layout.width, 1);
  const thumbW = THUMB_MAX_W;
  const thumbH = Math.max(36, Math.round(layout.height * scale));

  return (
    <View
      style={{
        width: thumbW,
        height: thumbH,
        borderRadius: 6,
        overflow: "hidden",
        backgroundColor: "#1a1a1a",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {posterUri ? (
        <Image source={{ uri: posterUri }} style={{ width: thumbW, height: thumbH }} resizeMode="contain" />
      ) : (
        <Ionicons name="videocam" size={20} color={accentColor} />
      )}
    </View>
  );
}

function ReplyPhotoThumb(props: { uri: string }) {
  return (
    <Image
      source={{ uri: props.uri }}
      style={{ width: THUMB_MAX_W, height: THUMB_MAX_W, borderRadius: 6, backgroundColor: "#1a1a1a" }}
      resizeMode="cover"
    />
  );
}

function ReplyMediaPlaceholder(props: { kind: Message["kind"]; accentColor: string }) {
  const icon =
    props.kind === "video" ? "videocam" : props.kind === "voice" ? "mic" : "image";
  return (
    <View
      style={{
        width: THUMB_MAX_W,
        height: THUMB_MAX_W,
        borderRadius: 6,
        backgroundColor: "#1a1a1a",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name={icon} size={20} color={props.accentColor} />
    </View>
  );
}

export function ChatReplyTargetPreview(props: Props) {
  const { message, textColor, subtleTextColor, accentColor, bodyStyle, metaStyle, metaText } = props;
  const body = getMessagePreviewBody(message);
  const showMediaThumb =
    (message.kind === "photo" ||
      message.kind === "gif" ||
      message.kind === "video") &&
    messageHasResolvableMedia(message);
  const tierBPeek = message.mediaEncrypted
    ? peekDisplayMediaUri(tierBDisplayCacheKey(message.mediaEncrypted))
    : undefined;
  const resolveEnabled =
    message.kind !== "video" || !message.mediaEncrypted || Boolean(tierBPeek);

  return (
    <>
      {metaText ? (
        <Text style={[metaStyle, { color: subtleTextColor }]} numberOfLines={1}>
          {metaText}
        </Text>
      ) : null}
      {showMediaThumb ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <ChatMessageMediaResolver message={message} resolveEnabled={resolveEnabled}>
            {(uri) => {
              if (!uri) {
                return <ReplyMediaPlaceholder kind={message.kind} accentColor={accentColor} />;
              }
              if (message.kind === "video") {
                return <ReplyVideoThumb uri={uri} message={message} accentColor={accentColor} />;
              }
              return <ReplyPhotoThumb uri={uri} />;
            }}
          </ChatMessageMediaResolver>
          <Text style={[bodyStyle, { color: textColor, flex: 1 }]} numberOfLines={2}>
            {body}
          </Text>
        </View>
      ) : (
        <Text style={[bodyStyle, { color: textColor }]} numberOfLines={3}>
          {body}
        </Text>
      )}
    </>
  );
}
