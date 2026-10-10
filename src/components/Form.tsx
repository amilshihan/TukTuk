import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { LANGUAGES, useI18n } from '@/lib/i18n';
import { colors, radius } from '@/theme';

export function TextField({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.textMuted} {...props} />
    </View>
  );
}

export function PrimaryButton({
  title,
  onPress,
  busy,
  disabled,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.button, (disabled || busy) && styles.disabled, pressed && styles.pressed]}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
    >
      {busy ? <ActivityIndicator color={colors.accentText} /> : <Text style={styles.buttonText}>{title}</Text>}
    </Pressable>
  );
}

export function LanguagePicker() {
  const { lang, setLang } = useI18n();
  return (
    <View style={styles.langRow}>
      {LANGUAGES.map((l) => (
        <Pressable
          key={l.code}
          onPress={() => setLang(l.code)}
          style={[styles.langChip, lang === l.code && styles.langChipActive]}
          accessibilityRole="button"
          accessibilityState={{ selected: lang === l.code }}
        >
          <Text style={[styles.langText, lang === l.code && styles.langTextActive]}>{l.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  input: {
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: {
    height: 56,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  buttonText: { color: colors.accentText, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.8 },
  langRow: { flexDirection: 'row', gap: 8 },
  langChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  langChipActive: { borderColor: colors.accent, backgroundColor: colors.surfaceRaised },
  langText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
  langTextActive: { color: colors.accent },
});
