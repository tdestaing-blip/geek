import { colors, radii, spacing, typography } from "@geek/design-tokens";
import type { Ref } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { GeekIcon } from "./geek-icon";

export function AddGameSearchField({
  autoFocus = false,
  inputRef,
  onChangeText,
  onSubmitEditing,
  placeholder,
  prominent = false,
  style,
  value,
}: {
  readonly autoFocus?: boolean;
  readonly inputRef?: Ref<TextInput>;
  readonly onChangeText: (value: string) => void;
  readonly onSubmitEditing?: () => void;
  readonly placeholder: string;
  readonly prominent?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly value: string;
}) {
  return (
    <View style={[styles.field, prominent && styles.prominentField, style]}>
      <GeekIcon color={colors.textSecondary} name="search" size={prominent ? 26 : 22} />
      <TextInput
        autoCorrect={false}
        autoFocus={autoFocus}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        ref={inputRef}
        returnKeyType="search"
        style={[styles.input, prominent && styles.prominentInput]}
        value={value}
      />
      {value ? (
        <Pressable
          accessibilityLabel="Effacer la recherche"
          hitSlop={10}
          onPress={() => onChangeText("")}
        >
          <GeekIcon color={colors.textSecondary} name="close" size={prominent ? 22 : 20} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    alignItems: "center",
    backgroundColor: colors.control,
    borderRadius: radii.capsule,
    flexDirection: "row",
    gap: spacing.compact,
    height: 44,
    marginHorizontal: spacing.page,
    paddingHorizontal: spacing.medium,
  },
  input: { ...typography.body, color: colors.text, flex: 1, padding: 0 },
  prominentField: { height: 44, paddingHorizontal: spacing.page },
  prominentInput: { fontSize: 14, fontWeight: "500" },
});
