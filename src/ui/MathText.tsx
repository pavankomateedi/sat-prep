/**
 * Renders the mixed text/math produced by mathParser as native views.
 *
 * Prose with no `$` takes a fast path through a single <Text>, so the layout
 * cost of the math machinery is only paid by items that actually need it — most
 * Reading & Writing items never touch it.
 *
 * When math is present the run becomes a wrapping row: plain words stay <Text>
 * so they break naturally, while fractions and radicals become small <View>
 * stacks. Every expression also carries an accessibilityLabel derived from
 * `toPlainText`, which is the main thing a WebView-based renderer could not do.
 */

import { memo, type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { colors, type as typography } from './theme';
import { parseMixed, toPlainText, type MathNode } from './mathParser';

interface MathTextProps {
  children: string;
  style?: StyleProp<TextStyle>;
  /** Base size; fractions and scripts derive their sizes from it. */
  fontSize?: number;
  color?: string;
}

const SCRIPT_SCALE = 0.72;
const FRACTION_SCALE = 0.92;

function renderNodes(nodes: MathNode[], size: number, color: string, keyPrefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (node.kind) {
      case 'text':
        return (
          <Text key={key} style={{ fontSize: size, color, fontStyle: 'italic' }}>
            {node.value}
          </Text>
        );

      case 'sup':
        return (
          <View key={key} style={styles.inlineRow}>
            {renderNodes(node.base, size, color, `${key}b`)}
            <Text
              style={{
                fontSize: size * SCRIPT_SCALE,
                color,
                fontStyle: 'italic',
                lineHeight: size * SCRIPT_SCALE,
                transform: [{ translateY: -size * 0.32 }],
              }}
            >
              {toPlainText(node.exponent)}
            </Text>
          </View>
        );

      case 'sub':
        return (
          <View key={key} style={styles.inlineRow}>
            {renderNodes(node.base, size, color, `${key}b`)}
            <Text
              style={{
                fontSize: size * SCRIPT_SCALE,
                color,
                fontStyle: 'italic',
                lineHeight: size * SCRIPT_SCALE,
                transform: [{ translateY: size * 0.22 }],
              }}
            >
              {toPlainText(node.index)}
            </Text>
          </View>
        );

      case 'frac': {
        const inner = size * FRACTION_SCALE;
        return (
          <View key={key} style={styles.fraction}>
            <View style={styles.fractionPart}>
              {renderNodes(node.numerator, inner, color, `${key}n`)}
            </View>
            <View style={[styles.fractionBar, { backgroundColor: color }]} />
            <View style={styles.fractionPart}>
              {renderNodes(node.denominator, inner, color, `${key}d`)}
            </View>
          </View>
        );
      }

      case 'sqrt':
        return (
          <View key={key} style={styles.inlineRow}>
            <Text style={{ fontSize: size * 1.1, color }}>√</Text>
            <View style={[styles.radicand, { borderTopColor: color }]}>
              {renderNodes(node.radicand, size, color, `${key}r`)}
            </View>
          </View>
        );
    }
  });
}

/**
 * Split plain text into word-sized <Text> nodes.
 *
 * Necessary because a flex row lays out its children as atoms: one <Text> with
 * a whole sentence would refuse to wrap and overflow the screen.
 */
function renderWords(value: string, size: number, color: string, keyPrefix: string): ReactNode[] {
  return value.split(/(\s+)/).map((chunk, index) =>
    chunk === '' ? null : (
      <Text key={`${keyPrefix}-w${index}`} style={{ fontSize: size, color }}>
        {chunk}
      </Text>
    )
  );
}

export const MathText = memo(function MathText({
  children,
  style,
  fontSize = typography.reading.fontSize,
  color = colors.text,
}: MathTextProps) {
  // Fast path: no math, so render as ordinary flowing prose.
  if (!children.includes('$')) {
    return (
      <Text style={[{ fontSize, color, lineHeight: fontSize * 1.55 }, style]}>{children}</Text>
    );
  }

  const segments = parseMixed(children);
  const label = segments
    .map((s) => (s.kind === 'text' ? s.value : toPlainText(s.nodes)))
    .join('');

  return (
    <View style={styles.wrap} accessible accessibilityLabel={label}>
      {segments.flatMap((segment, index) =>
        segment.kind === 'text'
          ? renderWords(segment.value, fontSize, color, `s${index}`)
          : renderNodes(segment.nodes, fontSize, color, `m${index}`)
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fraction: {
    flexDirection: 'column',
    alignItems: 'center',
    marginHorizontal: 3,
  },
  fractionPart: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  fractionBar: {
    height: StyleSheet.hairlineWidth * 2,
    alignSelf: 'stretch',
    marginVertical: 2,
  },
  radicand: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    paddingTop: 2,
    paddingHorizontal: 2,
  },
});
