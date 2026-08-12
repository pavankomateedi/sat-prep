/**
 * T-21 — Content sources and licences.
 *
 * CC BY 4.0 requires attribution wherever the material is redistributed, so
 * "we recorded it in a database column" is not sufficient — it has to be
 * visible to the person using the app. This screen is that surface, generated
 * from each item's own provenance rather than maintained by hand, so it cannot
 * drift out of date as the bank grows.
 */

import { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Body, Caption, Card, Divider, Heading, Label, Screen, Title } from '../src/ui/components';
import { colors, spacing, type as typography } from '../src/ui/theme';
import { ITEMS, PASSAGES } from '../content';
import type { LicenseKind, SourceAttribution } from '../src/domain/types';

const LICENSE_LABEL: Record<LicenseKind, string> = {
  original: 'Written for this app',
  public_domain: 'Public domain',
  cc_by_4_0: 'Creative Commons BY 4.0',
  official_as_delivered: 'Official practice material, used as delivered',
};

const LICENSE_NOTE: Record<LicenseKind, string> = {
  original: 'Questions written specifically for this app, modelled on the published test specification.',
  public_domain: 'Source text is out of copyright; the questions about it are original.',
  cc_by_4_0: 'Adapted from openly licensed material. Attribution and change notes below, as the licence requires.',
  official_as_delivered: 'Used only in its original form, never re-typeset into this question bank.',
};

export default function AttributionsScreen() {
  const grouped = useMemo(() => {
    const sources: SourceAttribution[] = [
      ...ITEMS.map((i) => i.source),
      ...PASSAGES.flatMap((p) => [p.source, p.sourceB].filter(Boolean) as SourceAttribution[]),
    ];

    const byKind = new Map<LicenseKind, { count: number; entries: SourceAttribution[] }>();
    for (const source of sources) {
      const entry = byKind.get(source.kind) ?? { count: 0, entries: [] };
      entry.count += 1;
      // One line per distinct work, not per item.
      if (source.title && !entry.entries.some((e) => e.title === source.title)) {
        entry.entries.push(source);
      }
      byKind.set(source.kind, entry);
    }
    return byKind;
  }, []);

  return (
    <Screen>
      <Title>Content sources</Title>
      <Body muted>
        Every question in this app is either written for it, built on public-domain text, or
        adapted from openly licensed material. Nothing is copied from a paid course or
        extracted from the official testing application.
      </Body>

      {[...grouped.entries()].map(([kind, group]) => (
        <Card key={kind}>
          <Label>{LICENSE_LABEL[kind]}</Label>
          <Heading>
            {group.count} question{group.count === 1 ? '' : 's'}
          </Heading>
          <Body muted>{LICENSE_NOTE[kind]}</Body>

          {group.entries.length > 0 ? (
            <>
              <Divider />
              {group.entries.map((entry) => (
                <View key={entry.title} style={styles.entry}>
                  <Text style={styles.entryTitle}>{entry.title}</Text>
                  {entry.author ? <Caption>{entry.author}</Caption> : null}
                  {entry.attributionText ? <Caption>{entry.attributionText}</Caption> : null}
                  {entry.modifications ? (
                    <Caption>Changes made: {entry.modifications}</Caption>
                  ) : null}
                  {entry.url ? (
                    <Text
                      style={styles.link}
                      onPress={() => void Linking.openURL(entry.url!)}
                      accessibilityRole="link"
                    >
                      {entry.url}
                    </Text>
                  ) : null}
                </View>
              ))}
            </>
          ) : null}
        </Card>
      ))}

      <Card>
        <Heading>Not used, deliberately</Heading>
        <Body muted>
          No content is taken from the Bluebook testing application, from undocumented question
          bank endpoints, from any paid course, or from state assessment items whose licensing
          could not be individually verified.
        </Body>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  entry: { marginBottom: spacing.md },
  entryTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  link: { ...typography.caption, color: colors.accent, marginTop: 2 },
});
