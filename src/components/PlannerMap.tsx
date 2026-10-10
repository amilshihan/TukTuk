import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { RoutePoint } from '@/lib/meter';
import { colors } from '@/theme';

type LatLng = { lat: number; lng: number };

/**
 * Interactive Leaflet map for planning: shows start/end pins and the route,
 * and reports taps so the driver can drop the destination on the map.
 * Updates are pushed in with injectJavaScript so the map isn't reloaded.
 */
export function PlannerMap({
  from,
  to,
  route,
  onTap,
}: {
  from: LatLng | null;
  to: LatLng | null;
  route: RoutePoint[] | null;
  onTap: (p: LatLng) => void;
}) {
  const ref = useRef<WebView>(null);
  const ready = useRef(false);
  const data = JSON.stringify({ from, to, route });
  const latest = useRef(data);

  useEffect(() => {
    latest.current = data;
    if (ready.current) ref.current?.injectJavaScript(`window.setData(${data}); true;`);
  }, [data]);

  // Build the page once; later changes go through setData.
  const html = useMemo(
    () => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#m{height:100%;margin:0;background:${colors.surface}}</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
var m = L.map('m', { zoomControl: false }).setView([6.9271, 79.8612], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  maxZoom: 19, subdomains: 'abcd', attribution: '&copy; OpenStreetMap &copy; CARTO'
}).addTo(m);
var pin = function (color) {
  return { radius: 9, color: '#000', weight: 2, fillColor: color, fillOpacity: 1 };
};
var fromM = null, toM = null, line = null, lastKey = '';
window.setData = function (d) {
  if (fromM) { m.removeLayer(fromM); fromM = null; }
  if (toM) { m.removeLayer(toM); toM = null; }
  if (line) { m.removeLayer(line); line = null; }
  if (d.route && d.route.length > 1) line = L.polyline(d.route, { color: '${colors.accent}', weight: 6, opacity: 0.95 }).addTo(m);
  if (d.from) fromM = L.circleMarker([d.from.lat, d.from.lng], pin('${colors.go}')).addTo(m);
  if (d.to) toM = L.circleMarker([d.to.lat, d.to.lng], pin('${colors.stop}')).addTo(m);
  // Re-fit only when the points change, so a driver's pan/zoom isn't undone.
  var key = JSON.stringify([d.from, d.to, d.route ? d.route.length : 0]);
  if (key === lastKey) return;
  lastKey = key;
  if (line) m.fitBounds(line.getBounds(), { padding: [40, 40] });
  else if (d.from && d.to) m.fitBounds([[d.from.lat, d.from.lng], [d.to.lat, d.to.lng]], { padding: [60, 60] });
  else if (d.from) m.setView([d.from.lat, d.from.lng], 15);
  else if (d.to) m.setView([d.to.lat, d.to.lng], 15);
};
m.on('click', function (e) {
  window.ReactNativeWebView.postMessage(JSON.stringify({ lat: e.latlng.lat, lng: e.latlng.lng }));
});
</script></body></html>`,
    [],
  );

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
