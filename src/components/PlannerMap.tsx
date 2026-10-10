import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { RoutePoint } from '@/lib/meter';
import { colors } from '@/theme';
import { mapHtml } from './mapHtml';
import { NativeMap, useNativeMaps } from './NativeMap';

type LatLng = { lat: number; lng: number };

/**
 * Interactive map for planning: shows start/end pins and the route,
 * and reports taps so the driver can drop the destination on the map.
 * Updates are pushed in with injectJavaScript so the map isn't reloaded.
 */
type Props = {
  from: LatLng | null;
  to: LatLng | null;
  route: RoutePoint[] | null;
  onTap: (p: LatLng) => void;
};

export function PlannerMap(props: Props) {
  if (useNativeMaps) {
    return (
      <View style={styles.wrap}>
        <NativeMap {...props} />
      </View>
    );
  }
  return <WebPlannerMap {...props} />;
}

function WebPlannerMap({
  from,
  to,
  route,
  onTap,
}: Props) {
  const ref = useRef<WebView>(null);
  const ready = useRef(false);
  const data = JSON.stringify({ from, to, route });
  const latest = useRef(data);

  useEffect(() => {
    latest.current = data;
    if (ready.current) ref.current?.injectJavaScript(`window.setData(${data}); true;`);
  }, [data]);

  // Build the page once; later changes go through setData.
  const html = useMemo(() => mapHtml({ interactive: true }), []);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const p = JSON.parse(e.nativeEvent.data) as LatLng;
      onTap({ lat: p.lat, lng: p.lng });
    } catch {}
  };

  return (
    <View style={styles.wrap}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html }}
        onMessage={onMessage}
        onLoadEnd={() => {
          ready.current = true;
          ref.current?.injectJavaScript(`window.setData(${latest.current}); true;`);
        }}
        style={styles.web}
        javaScriptEnabled
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  web: { backgroundColor: colors.surface },
});
