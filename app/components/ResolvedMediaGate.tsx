import type { ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";

import { useResolvedMediaUri } from "../hooks/useResolvedMediaUri";
import type { EncryptedMediaRef } from "../lib/tierBMedia/types";

type Props = {
  legacyUri?: string;
  encrypted?: EncryptedMediaRef;
  children: (displayUri: string) => ReactNode;
  /** When true, show a small spinner while Tier B media decrypts. */
  showLoading?: boolean;
};

export function ResolvedMediaGate({ legacyUri, encrypted, children, showLoading = true }: Props) {
  const { uri: displayUri, resolving } = useResolvedMediaUri(legacyUri, encrypted);
  if (!displayUri) {
    if (!showLoading || (!legacyUri && !encrypted) || !resolving) return null;
    return (
      <View style={{ paddingVertical: 12, alignItems: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  return <>{children(displayUri)}</>;
}
