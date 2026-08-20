import { colors } from "@geek/design-tokens";
import { Image, type ImageSourcePropType, StyleSheet, View } from "react-native";

export function AvatarStack({ images }: { readonly images: readonly ImageSourcePropType[] }) {
  return (
    <View style={styles.stack}>
      {images.map((image, index) => (
        <Image key={index} source={image} style={[styles.avatar, index > 0 && styles.overlap]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { alignItems: "center", flexDirection: "row" },
  avatar: {
    borderColor: colors.controlSelected,
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    width: 32,
  },
  overlap: { marginLeft: -16 },
});
