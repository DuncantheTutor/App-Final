import { Text, StyleSheet } from "react-native";

type Props = {
  color: string;
};

/** App name shown at the top of a screen, in the active theme colour. */
export function AppNameBanner({ color }: Props) {
  return <Text style={[styles.name, { color }]}>Erdos</Text>;
}

const styles = StyleSheet.create({
  name: {
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
});
