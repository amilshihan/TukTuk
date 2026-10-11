import { Tabs } from 'expo-router';
import { TileTabBar } from '@/components/TileTabBar';
import { useI18n } from '@/lib/i18n';
import { colors } from '@/theme';

export default function TabsLayout() {
  const { t } = useI18n();
  return (
    <Tabs
      tabBar={(props) => <TileTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('tabMeter'), headerShown: false }} />
      <Tabs.Screen name="plan" options={{ title: t('tabPlan'), headerShown: false }} />
      <Tabs.Screen name="trips" options={{ title: t('tabTrips') }} />
      <Tabs.Screen name="settings" options={{ title: t('tabSettings') }} />
    </Tabs>
  );
}
