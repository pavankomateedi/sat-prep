/**
 * First-run setup.
 *
 * Asks for the four things the scheduler genuinely needs and nothing else. In
 * particular it asks for a nickname, not a name — PRD §2.7 puts legal name on
 * the do-not-collect list, and the field it would be stored in does not exist.
 */

import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Caption, Card, Heading, Label, Notice, Screen, Title } from '../src/ui/components';
import { colors, radius, spacing } from '../src/ui/theme';
import * as repo from '../src/data/repositories';
import { isValidLocalDate, toLocalDate } from '../src/lib/dates';
import { DEFAULT_TARGET_TEST_DATE } from '../src/domain/program';

export default function SetupScreen() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [grade, setGrade] = useState('9');
  const [targetDate, setTargetDate] = useState(DEFAULT_TARGET_TEST_DATE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const gradeLevel = Number(grade);
    if (nickname.trim() === '') return setError('Pick a nickname to display.');
    if (!Number.isInteger(gradeLevel) || gradeLevel < 5 || gradeLevel > 12) {
      return setError('Grade level should be between 5 and 12.');
    }
    if (!isValidLocalDate(targetDate)) return setError('Target date should be YYYY-MM-DD.');
    if (targetDate <= toLocalDate()) return setError('The target test date needs to be in the future.');

    setSaving(true);
    try {
      await repo.upsertStudent({
        id: repo.newId(),
        displayName: nickname.trim(),
        gradeLevel,
        programStartDate: toLocalDate(),
        targetTestDate: targetDate,
      });
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Title>Let's set up</Title>
      <Body muted>
        Thirty minutes a day, every day, until the test. The app decides what those thirty
        minutes contain.
      </Body>

      <Card>
        <Label>Nickname</Label>
        <TextInput
          value={nickname}
          onChangeText={setNickname}
          placeholder="What should the app call you?"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoCapitalize="words"
        />
        <Caption>A nickname is enough. The app never stores a full name.</Caption>

        <View style={styles.gap} />

        <Label>Grade level</Label>
        <TextInput
          value={grade}
          onChangeText={setGrade}
          keyboardType="number-pad"
          style={styles.input}
          maxLength={2}
        />

        <View style={styles.gap} />

        <Label>Target test date</Label>
        <TextInput
          value={targetDate}
          onChangeText={setTargetDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoCapitalize="none"
        />
        <Caption>
          Used to pace the four phases of the programme. It can be changed later.
        </Caption>
      </Card>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      <Button title={saving ? 'Saving…' : 'Start'} onPress={save} disabled={saving} />

      <Card>
        <Heading>What this app collects</Heading>
        <Body muted>
          Which questions you answered, whether you got them right, and how long you took.
          Nothing else — no full name, address, phone number, photos, or location. Everything
          stays on this device unless you turn on backup.
        </Body>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 50,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    marginBottom: spacing.xs,
  },
  gap: { height: spacing.md },
});
