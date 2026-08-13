/**
 * The in-test calculator.
 *
 * The real Digital SAT embeds Desmos on every Math question. Two paths here,
 * chosen at open time:
 *
 *  - **Online** → the real Desmos, in a WebView. Exact parity with test day.
 *  - **Offline** → a built-in grapher using the expression engine in
 *    src/calculator/expression.ts.
 *
 * The fallback exists because PRD §2.5 makes offline operation a hard
 * requirement, and Desmos's API has to be fetched from their CDN. Rather than
 * quietly degrading, the header states which one is running — a student who
 * does not know the calculator is the simplified one might think a Desmos
 * feature is broken.
 */

import { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Network from 'expo-network';
import { WebView } from 'react-native-webview';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import {
  DEFAULT_VIEWPORT,
  findRoots,
  formatResult,
  plot,
  tryEvaluate,
  type Viewport,
} from '../calculator/expression';
import { colors, radius, spacing, type as typography } from './theme';

const GRAPH_SIZE = 300;

/**
 * Desmos API key.
 *
 * Falls back to the demo key Desmos publishes in their documentation, which is
 * intended for evaluation rather than a shipped app. Request a free key at
 * https://www.desmos.com/api and set EXPO_PUBLIC_DESMOS_API_KEY before relying
 * on this in daily use — the demo key carries no availability guarantee, and
 * this is a two-year programme.
 *
 * If Desmos fails to load for any reason, the offline calculator takes over
 * (see onError below), so a key problem degrades rather than breaks.
 */
const DESMOS_API_KEY =
  process.env.EXPO_PUBLIC_DESMOS_API_KEY ?? 'dcb31709b452b1cf9dc26972add0fda6';

const DESMOS_HTML = `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
    <script src="https://www.desmos.com/api/v1.11/calculator.js?apiKey=${DESMOS_API_KEY}"></script>
    <style>html,body,#calc{margin:0;padding:0;width:100%;height:100%;overflow:hidden}</style>
  </head>
  <body>
    <div id="calc"></div>
    <script>
      Desmos.GraphingCalculator(document.getElementById('calc'), {
        keypad: true, expressions: true, settingsMenu: false, zoomButtons: true,
        border: false, lockViewport: false
      });
    </script>
  </body>
</html>`;

export function CalculatorButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open calculator"
      style={({ pressed }) => [styles.toolButton, pressed && styles.toolButtonPressed]}
    >
      <Text style={styles.toolButtonText}>Calculator</Text>
    </Pressable>
  );
}

export function Calculator({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const network = Network.useNetworkState();
  // `isInternetReachable` is undefined until the first probe returns; treat
  // that as offline so we never render a WebView that cannot load.
  const online = network.isConnected === true && network.isInternetReachable === true;
  const [forceOffline, setForceOffline] = useState(false);
  const useDesmos = online && !forceOffline;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{useDesmos ? 'Desmos' : 'Calculator'}</Text>
          <View style={styles.headerRight}>
            {online ? (
              <Pressable onPress={() => setForceOffline((v) => !v)} accessibilityRole="button">
                <Text style={styles.headerLink}>{useDesmos ? 'Use basic' : 'Use Desmos'}</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} accessibilityRole="button">
              <Text style={styles.headerLink}>Done</Text>
            </Pressable>
          </View>
        </View>

        {!online ? (
          <Text style={styles.notice}>
            Offline — using the built-in calculator. It graphs and evaluates, but is simpler
            than the Desmos tool on the real test.
          </Text>
        ) : null}

        {useDesmos ? (
          <WebView
            source={{ html: DESMOS_HTML }}
            style={styles.webview}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            // If Desmos fails to load for any reason, fall back rather than
            // leaving a blank rectangle where the calculator should be.
            onError={() => setForceOffline(true)}
            onHttpError={() => setForceOffline(true)}
          />
        ) : (
          <OfflineCalculator />
        )}
      </View>
    </Modal>
  );
}

function OfflineCalculator() {
  const [expression, setExpression] = useState('');
  const [viewport, setViewport] = useState<Viewport>(DEFAULT_VIEWPORT);

  // A bare arithmetic expression evaluates to a number; anything mentioning x
  // is a curve to draw. Deciding by content means the student does not have to
  // pick a mode.
  const isFunction = /\bx\b/.test(expression);

  const value = useMemo(
    () => (isFunction || expression.trim() === '' ? null : tryEvaluate(expression)),
    [expression, isFunction]
  );

  const graph = useMemo(
    () => (isFunction ? plot(expression, viewport) : { segments: [], error: null }),
    [expression, isFunction, viewport]
  );

  const roots = useMemo(
    () => (isFunction && graph.segments.length > 0 ? findRoots(expression, viewport) : []),
    [expression, isFunction, viewport, graph.segments.length]
  );

  const toX = (x: number) =>
    ((x - viewport.xMin) / (viewport.xMax - viewport.xMin)) * GRAPH_SIZE;
  const toY = (y: number) =>
    GRAPH_SIZE - ((y - viewport.yMin) / (viewport.yMax - viewport.yMin)) * GRAPH_SIZE;

  const zoom = (factor: number) => {
    const cx = (viewport.xMin + viewport.xMax) / 2;
    const cy = (viewport.yMin + viewport.yMax) / 2;
    const halfX = ((viewport.xMax - viewport.xMin) / 2) * factor;
    const halfY = ((viewport.yMax - viewport.yMin) / 2) * factor;
    setViewport({
      xMin: cx - halfX,
      xMax: cx + halfX,
      yMin: cy - halfY,
      yMax: cy + halfY,
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.offlineBody} keyboardShouldPersistTaps="handled">
      <TextInput
        value={expression}
        onChangeText={setExpression}
        placeholder="2 + 3 * 4   or   y = x^2 - 4  (type x to graph)"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel="Calculator expression"
      />

      {value !== null ? (
        <Text style={styles.result} accessibilityLabel={`Result ${formatResult(value)}`}>
          = {formatResult(value)}
        </Text>
      ) : null}

      {expression.trim() !== '' && value === null && !isFunction ? (
        <Text style={styles.error}>Cannot evaluate that.</Text>
      ) : null}

      {isFunction ? (
        <>
          {graph.error ? <Text style={styles.error}>{graph.error}</Text> : null}

          <View style={styles.graphWrap}>
            <Svg width={GRAPH_SIZE} height={GRAPH_SIZE}>
              {/* Axes, drawn only when zero is inside the viewport. */}
              {viewport.yMin < 0 && viewport.yMax > 0 ? (
                <Line
                  x1={0}
                  y1={toY(0)}
                  x2={GRAPH_SIZE}
                  y2={toY(0)}
                  stroke={colors.textFaint}
                  strokeWidth={1}
                />
              ) : null}
              {viewport.xMin < 0 && viewport.xMax > 0 ? (
                <Line
                  x1={toX(0)}
                  y1={0}
                  x2={toX(0)}
                  y2={GRAPH_SIZE}
                  stroke={colors.textFaint}
                  strokeWidth={1}
                />
              ) : null}

              {graph.segments.map((segment, i) => (
                <Path
                  key={`seg${i}`}
                  d={segment
                    .map(
                      (p, j) =>
                        `${j === 0 ? 'M' : 'L'}${toX(p.x).toFixed(2)},${toY(p.y).toFixed(2)}`
                    )
                    .join(' ')}
                  stroke={colors.accent}
                  strokeWidth={2}
                  fill="none"
                />
              ))}

              {roots.map((root, i) => (
                <Circle key={`root${i}`} cx={toX(root)} cy={toY(0)} r={4} fill={colors.incorrect} />
              ))}

              <SvgText x={4} y={12} fontSize={10} fill={colors.textFaint}>
                {viewport.yMax.toFixed(0)}
              </SvgText>
              <SvgText x={4} y={GRAPH_SIZE - 4} fontSize={10} fill={colors.textFaint}>
                {viewport.yMin.toFixed(0)}
              </SvgText>
            </Svg>
          </View>

          <View style={styles.zoomRow}>
            <Pressable onPress={() => zoom(1.6)} style={styles.zoomButton}>
              <Text style={styles.zoomText}>Zoom out</Text>
            </Pressable>
            <Pressable onPress={() => setViewport(DEFAULT_VIEWPORT)} style={styles.zoomButton}>
              <Text style={styles.zoomText}>Reset</Text>
            </Pressable>
            <Pressable onPress={() => zoom(0.625)} style={styles.zoomButton}>
              <Text style={styles.zoomText}>Zoom in</Text>
            </Pressable>
          </View>

          {roots.length > 0 ? (
            <Text style={styles.caption}>
              Crosses the x-axis at {roots.map((r) => Number(r.toFixed(3))).join(', ')}
            </Text>
          ) : null}
        </>
      ) : null}

      <Text style={styles.caption}>
        Supports + − × ÷ ^, brackets, sqrt, abs, sin, cos, tan, log, ln, pi, e. Trigonometry is
        in radians, as on the test.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: { ...typography.heading, color: colors.text },
  headerRight: { flexDirection: 'row', gap: spacing.md },
  headerLink: { ...typography.heading, color: colors.accent },
  notice: {
    ...typography.caption,
    color: colors.warn,
    backgroundColor: colors.warnSoft,
    padding: spacing.sm,
    margin: spacing.md,
    borderRadius: radius.sm,
  },
  webview: { flex: 1 },
  offlineBody: { padding: spacing.md, gap: spacing.md },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
    fontSize: 18,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  result: { ...typography.display, color: colors.text },
  error: { ...typography.caption, color: colors.incorrect },
  graphWrap: {
    alignSelf: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  zoomRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  zoomButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  zoomText: { ...typography.caption, color: colors.accent, fontWeight: '600' },
  caption: { ...typography.caption, color: colors.textMuted },
  toolButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  toolButtonPressed: { backgroundColor: colors.surfaceAlt },
  toolButtonText: { ...typography.caption, color: colors.accent, fontWeight: '600' },
});
