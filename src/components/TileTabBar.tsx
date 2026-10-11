import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, tiles } from '@/theme';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TILE: Record<string, { tile: (typeof tiles)[keyof typeof tiles]; icon: keyof typeof Ionicons.glyphMap }> = {
  index: { tile: tiles.meter, icon: 'speedometer' },
  plan: { tile: tiles.route, icon: 'map' },
  trips: { tile: tiles.trips, icon: 'list' },
  settings: { tile: tiles.settings, icon: 'settings-sharp' },
};

/** Bottom navigation as big pastel tiles, matching the home screen design. */
export function TileTabBar({ state, descriptors, navigation, insets }: TabBarProps) {
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, index) => {
        const cfg = TILE[route.name];
        if (!cfg) return null;
        const focused = state.index === index;
        const label = descriptors[route.key].options.title ?? route.name;
        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: cfg.tile.bg },
              focused && { borderColor: cfg.tile.icon },
              pressed && { opacity: 0.8 },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: cfg.tile.icon }]}>
              <Ionicons name={cfg.icon} size={22} color={'iconText' in cfg.tile ? cfg.tile.iconText : '#fff'} />
            </View>
            <Text style={[styles.label, focused && styles.labelFocused]} numberOfLines={1} adjustsFontSizeToFit>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: colors.text, fontSize: 13, fontWeight: '700' },
  labelFocused: { fontWeight: '900' },
});
