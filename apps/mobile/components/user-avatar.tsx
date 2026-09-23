import { useState } from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { palette } from "@/components/crm-ui";

type UserAvatarProps = {
  src?: string | null;
  name?: string | null;
  alt?: string | null;
  size?: number;
  borderRadius?: number;
  backgroundColor?: string;
  color?: string;
  fontSize?: number;
  style?: StyleProp<ViewStyle>;
};

export function UserAvatar({
  src,
  name,
  alt,
  size = 40,
  borderRadius = 20,
  backgroundColor = "rgba(20, 166, 135, 0.12)",
  color = palette.primary,
  fontSize = 14,
  style,
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);

  const initials = (name || alt || "AD")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius,
          backgroundColor,
        },
        style,
      ]}
    >
      {src && !imageError ? (
        <Image
          source={{ uri: src }}
          style={{ width: "100%", height: "100%", borderRadius }}
          onError={() => setImageError(true)}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.initials, { color, fontSize }]}>{initials || "؟"}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  initials: {
    fontWeight: "900",
    textAlign: "center",
  },
});
