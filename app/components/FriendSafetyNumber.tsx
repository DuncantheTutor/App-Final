import { useEffect, useState } from "react";
import { Text, type TextStyle } from "react-native";

import { ensureFriendSafetyNumber } from "../messaging/recipientKeys";
import { readActiveBackendSession } from "../session/activeBackendSession";

export function FriendSafetyNumber(props: { friendUid: string; style?: TextStyle }) {
  const { friendUid, style } = props;
  const [number, setNumber] = useState<string | null>(null);

  useEffect(() => {
    const session = readActiveBackendSession();
    const friend = friendUid.trim();
    if (!session || !friend) {
      setNumber(null);
      return;
    }
    let cancelled = false;
    void ensureFriendSafetyNumber(session, friend).then((value) => {
      if (!cancelled) setNumber(value);
    });
    return () => {
      cancelled = true;
    };
  }, [friendUid]);

  if (!number) return null;
  return <Text style={style}>Safety number {number}</Text>;
}
