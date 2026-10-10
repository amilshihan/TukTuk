import { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { RoutePoint } from '@/lib/meter';
import { colors, radius } from '@/theme';
import { mapHtml } from './mapHtml';
import { NativeMap, useNativeMaps } from './NativeMap';

/**
 * A finished trip's route on a real map (receipt). Static: no panning, so it
 * doesn't fight the screen's scrolling. Needs internet; the receipt works without it.
 */
export function RouteMap({ route, height = 220 }: { route: RoutePoint[]; height?: number }) {
  if (useNativeMaps) {
    const end = route[route.length - 1];
    return (
      <View style={[styles.wrap, { height }]}>
        <NativeMap
          from={{ lat: route[0][0], lng: route[0][1] }}
          to={{ lat: end[0], lng: end[1] }}
          route={route}
          interactive={false}
        />
      </View>
    );
  }
  return <WebRouteMap route={route} height={height} />;
}

function WebRouteMap({ route, height }: { route: RoutePoint[]; height: number }) {
  const ref = useRef<WebView>(null);
  const html = useMemo(() => mapHtml({ interactive: false }), []);
  const data = JSON.stringify({
    from: { lat: route[0][0], lng: route[0][1] },
    to: { lat: route[route.length - 1][0], lng: route[route.length - 1][1] },
    route,
  });

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html }}
        onLoadEnd={() => ref.current?.injectJavaScript(`window.setData(${data}); true;`)}
        scrollEnabled={false}
        style={styles.web}
        javaScriptEnabled
        setSupportMultipleWindows={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surface },
  web: { backgroundColor: colors.surface },
});
