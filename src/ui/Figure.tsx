/**
 * Renders the tables and charts attached to quantitative-evidence and
 * data-analysis items.
 *
 * Structured data rather than bitmaps, so figures stay sharp at any text size,
 * work offline with no asset loading, and remain readable by a screen reader —
 * which an image of a table never is.
 */

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';
import type { ItemFigure } from '../domain/types';
import { colors, radius, spacing, type as typography } from './theme';

export function Figure({ figure }: { figure: ItemFigure }) {
  return (
    <View style={styles.container}>
      {figure.caption ? <Text style={styles.caption}>{figure.caption}</Text> : null}
      {figure.kind === 'table' ? <TableFigure figure={figure} /> : <ChartFigure figure={figure} />}
    </View>
  );
}

function TableFigure({ figure }: { figure: ItemFigure }) {
  const columns = figure.columns ?? [];
  const rows = figure.rows ?? [];

  return (
    <View style={styles.table} accessibilityLabel={describeTable(figure)}>
      <View style={[styles.row, styles.headerRow]}>
        {columns.map((column, i) => (
          <View key={`h${i}`} style={[styles.cell, i === 0 && styles.firstCell]}>
            <Text style={styles.headerText}>{column}</Text>
          </View>
        ))}
      </View>
      {rows.map((row, r) => (
        <View
          key={`r${r}`}
          style={[styles.row, r === rows.length - 1 && styles.lastRow]}
        >
          {row.map((cell, c) => (
            <View key={`c${c}`} style={[styles.cell, c === 0 && styles.firstCell]}>
              <Text style={[styles.cellText, c === 0 && styles.rowLabel]}>{cell}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const CHART = { width: 300, height: 180, pad: 28 };

function ChartFigure({ figure }: { figure: ItemFigure }) {
  const series = figure.series ?? [];
  const points = series.flatMap((s) => s.points);
  if (points.length === 0) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(0, ...ys);
  const maxY = Math.max(...ys);

  const plotW = CHART.width - CHART.pad * 2;
  const plotH = CHART.height - CHART.pad * 2;
  const sx = (x: number) => CHART.pad + ((x - minX) / (maxX - minX || 1)) * plotW;
  const sy = (y: number) => CHART.height - CHART.pad - ((y - minY) / (maxY - minY || 1)) * plotH;

  return (
    <View accessibilityLabel={describeChart(figure)}>
      <Svg width={CHART.width} height={CHART.height}>
        <Line
          x1={CHART.pad}
          y1={CHART.height - CHART.pad}
          x2={CHART.width - CHART.pad}
          y2={CHART.height - CHART.pad}
          stroke={colors.border}
          strokeWidth={1}
        />
        <Line
          x1={CHART.pad}
          y1={CHART.pad}
          x2={CHART.pad}
          y2={CHART.height - CHART.pad}
          stroke={colors.border}
          strokeWidth={1}
        />

        {series.map((s, i) =>
          figure.kind === 'bar' ? (
            s.points.map((p, j) => (
              <Rect
                key={`b${i}-${j}`}
                x={sx(p.x) - 8}
                y={sy(p.y)}
                width={16}
                height={CHART.height - CHART.pad - sy(p.y)}
                fill={colors.accent}
                opacity={0.85}
              />
            ))
          ) : figure.kind === 'line' ? (
            <Polyline
              key={`l${i}`}
              points={s.points.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2}
            />
          ) : (
            s.points.map((p, j) => (
              <Circle key={`p${i}-${j}`} cx={sx(p.x)} cy={sy(p.y)} r={3.5} fill={colors.accent} />
            ))
          )
        )}
      </Svg>
      <View style={styles.axisRow}>
        {figure.xLabel ? <Text style={styles.axisLabel}>{figure.xLabel}</Text> : null}
        {figure.yLabel ? <Text style={styles.axisLabel}>{figure.yLabel}</Text> : null}
      </View>
    </View>
  );
}

/** Screen-reader description: a table read cell by cell is unusable. */
function describeTable(figure: ItemFigure): string {
  const columns = figure.columns ?? [];
  const rows = figure.rows ?? [];
  const body = rows
    .map((row) => row.map((cell, i) => `${columns[i] ?? ''} ${cell}`.trim()).join(', '))
    .join('. ');
  return `Table. ${figure.caption ?? ''}. ${body}`;
}

function describeChart(figure: ItemFigure): string {
  const series = figure.series ?? [];
  const described = series
    .map((s) => `${s.label}: ${s.points.map((p) => `${p.x} to ${p.y}`).join(', ')}`)
    .join('. ');
  return `Chart. ${figure.caption ?? ''}. ${described}`;
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.md },
  caption: { ...typography.label, color: colors.textMuted, marginBottom: spacing.sm },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerRow: { backgroundColor: colors.surfaceAlt },
  lastRow: { borderBottomWidth: 0 },
  cell: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
  firstCell: { flex: 1.5 },
  headerText: { ...typography.caption, fontWeight: '600', color: colors.text },
  cellText: { ...typography.caption, color: colors.text },
  rowLabel: { fontWeight: '600' },
  axisRow: { flexDirection: 'row', justifyContent: 'space-between' },
  axisLabel: { ...typography.caption, color: colors.textFaint },
});
