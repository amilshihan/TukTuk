import Svg, { Circle, Polyline } from 'react-native-svg';
import type { RoutePoint } from '@/lib/meter';
import { colors } from '@/theme';

/**
 * The route's shape without map tiles, drawn natively so it can be captured
 * into the shareable receipt image (WebView maps can't be captured reliably).
 */
export function RouteSketch({ route, width, height }: { route: RoutePoint[]; width: number; height: number }) {
  if (route.length < 2) return null;
  const pad = 12;
  // Equirectangular projection; longitude scaled by cos(latitude) so shapes aren't stretched.
  const k = Math.cos((route[0][0] * Math.PI) / 180);
  const xs = route.map(([, lng]) => lng * k);
  const ys = route.map(([lat]) => lat);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const scale = Math.min((width - pad * 2) / span, (height - pad * 2) / span);
  const offX = (width - (maxX - minX) * scale) / 2;
  const offY = (height - (maxY - minY) * scale) / 2;
  const pts = xs.map((x, i) => [offX + (x - minX) * scale, height - (offY + (ys[i] - minY) * scale)] as const);

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={pts.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke={colors.accent}
        strokeWidth={4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Circle cx={pts[0][0]} cy={pts[0][1]} r={6} fill={colors.go} />
      <Circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={6} fill={colors.stop} />
    </Svg>
  );
}
