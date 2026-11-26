import { useCallback, useState } from 'react'
import { useFocusEffect } from 'expo-router'
import { Alert, Text, TextInput, View } from 'react-native'
import { AccountGate, Button, colors, ErrorNotice, Page, Pressy, styles, TextButton } from '../components/ui'
import { request } from '../lib/api'
import type { TaskName } from '../lib/data-export'
import { rowsIn } from '../lib/import-rows'
import { CATEGORY_LABELS } from '../lib/taxonomy'
import { useSession } from '../state/session'
import { loadVocab } from '../state/vocab'
import { outcome, useOffer, useVisit } from '../lib/usage'

// Changes to saved words coming back from an AI (DATA-1): paste its answer, see exactly what it
// would change and what it refuses and why, then apply it; an import can be undone. The server
// checks every row the same way for the preview and for applying (functions/lib/data-tasks.ts),
// and no import can change what was learned: results, cards and the sentences words were met in.
type Change = { id: string; lemma: string; field: string; from: unknown; to: unknown }
type Plan = { rows: number; changes: Change[]; unchanged: number; rejected: { id: string; reason: string }[]; applied?: string }
type Done = { id: string; task: string; at: number; changes: number; undone: boolean }
const TASKS: Record<TaskName, string> = { 'classify-v1': 'Organise by theme', 'normalize-v1': 'Fix entries' }
const FIELDS: Record<string, string> = { categories: 'themes', register: 'register', level: 'level', lemma: 'dictionary form', gloss: 'meaning', partOfSpeech: 'part of speech', archived: 'archived' }
const shown = (value: unknown) => (value === null || value === undefined ? '—'
  : Array.isArray(value) ? value.map(item => CATEGORY_LABELS[item as keyof typeof CATEGORY_LABELS] || item).join(', ') || 'none' : String(value))

export default function Import() {
  const { session } = useSession()
  const [task, setTask] = useState<TaskName>('classify-v1')
  const [text, setText] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<Done[]>([])
  const loadRecent = useCallback(() => {
    if (session) void request<{ imports: Done[] }>('data?imports=1', { token: session.token }).then(data => setRecent(data.imports), () => {})
  }, [session])
  useFocusEffect(useCallback(() => { loadRecent() }, [loadRecent]))
  // Usage (lib/usage.ts): the import's steps each visit, as they become possible.
  const visit = useVisit()
  const importPick = useOffer('import', session ? visit : null, ['task', !!text.trim() && 'preview changes', !!plan && !plan.applied && plan.changes.length > 0 && 'apply changes', recent.some(item => !item.undone) && 'undo an import'])
  if (!session) return <Page><AccountGate /></Page>

  const send = async (apply: boolean) => {
    const rows = rowsIn(text)
    if (!rows) { setError('No JSON list found in what was pasted. Paste the AI\'s whole answer.'); return }
    setBusy(true); setError(null)
    try {
      const result = await request<Plan>('data', { token: session.token, body: { task, rows, apply }, timeoutMs: 60000 })
      setPlan(result)
      outcome('import', apply ? 'applied' : result.changes.length ? 'previewed' : 'nothing to change', { changes: result.changes.length })
      if (result.applied) { void loadVocab(session); loadRecent(); setText('') }
    } catch (failure) { outcome('import', 'failed'); setError((failure as Error).message) }
    finally { setBusy(false) }
  }
  const undo = (item: Done) => Alert.alert('Undo this import?', `Its ${item.changes} ${item.changes === 1 ? 'change goes' : 'changes go'} back to what they were, except where something has changed them since.`, [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Undo', onPress: () => {
      void request<{ restored: number; skipped: number }>('data', { token: session.token, body: { undo: item.id } })
        .then(result => { void loadVocab(session); loadRecent(); setPlan(null); Alert.alert('Undone', `${result.restored} put back${result.skipped ? `, ${result.skipped} left as they had changed since` : ''}.`) }, (failure: Error) => setError(failure.message))
    } },
  ])
  const words = plan ? new Set(plan.changes.map(change => change.id)).size : 0

  return <Page>
    <ErrorNotice message={error} />
    <View style={styles.card}>
      <Text style={styles.heading}>What the changes are for</Text>
      <View style={[styles.row, { gap: 8 }]}>
        {(Object.keys(TASKS) as TaskName[]).map(key => <Pressy key={key} moment="tick" accessibilityRole="radio" accessibilityState={{ checked: task === key }} onPress={() => { importPick('task', { value: key }); setTask(key); setPlan(null) }}
          style={{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: task === key ? colors.green : colors.line, backgroundColor: task === key ? colors.lime : colors.white }}>
          <Text style={{ fontSize: 15, fontWeight: '600', color: task === key ? colors.green : colors.muted }}>{TASKS[key]}</Text>
        </Pressy>)}
      </View>
      <Text style={styles.copy}>Paste the AI’s answer to the file you exported from Account → Saved words.</Text>
      <TextInput value={text} onChangeText={value => { setText(value); setPlan(null) }} multiline placeholder='[{"id": "...", ...}]' placeholderTextColor={colors.muted}
        autoCorrect={false} autoCapitalize="none" style={[styles.input, { minHeight: 140, maxHeight: 260, textAlignVertical: 'top', fontSize: 14 }]} />
      <Button title="Preview changes" busy={busy && !plan} disabled={!text.trim()} onPress={() => { importPick('preview changes'); void send(false) }} />
    </View>
    {plan && <View style={styles.card}>
      <Text style={styles.heading}>{plan.applied ? 'Applied' : 'Preview'}</Text>
      <Text style={styles.copy}>{plan.changes.length} {plan.changes.length === 1 ? 'change' : 'changes'} to {words} {words === 1 ? 'word' : 'words'}; {plan.unchanged} already as they would be; {plan.rejected.length} refused. Nothing you have learned changes.</Text>
      {plan.changes.slice(0, 200).map((change, i) => <Text key={i} style={[styles.copy, { fontSize: 14, lineHeight: 21, color: colors.ink }]}>
        <Text style={{ fontWeight: '600' }}>{change.lemma}</Text> · {FIELDS[change.field] || change.field}: {shown(change.from)} → {shown(change.to)}
      </Text>)}
      {plan.changes.length > 200 && <Text style={styles.copy}>…and {plan.changes.length - 200} more.</Text>}
      {!!plan.applied && task === 'classify-v1' && <Text style={styles.copy}>To organise the words still waiting, share Words to organise by theme again from Account.</Text>}
      {plan.rejected.map((row, i) => <Text key={`r${i}`} style={[styles.copy, { fontSize: 14, lineHeight: 21, color: colors.red }]}>{row.id}: {row.reason}</Text>)}
      {!plan.applied && plan.changes.length > 0 && <Button title={`Apply ${plan.changes.length} ${plan.changes.length === 1 ? 'change' : 'changes'}`} busy={busy} onPress={() => { importPick('apply changes'); void send(true) }} />}
    </View>}
    {recent.length > 0 && <View style={styles.card}>
      <Text style={styles.heading}>Recent imports</Text>
      {recent.map(item => <View key={item.id} style={[styles.row, { justifyContent: 'space-between', flexWrap: 'nowrap' }]}>
        <Text style={[styles.copy, { flex: 1, fontSize: 14 }]}>{TASKS[item.task as TaskName] || item.task} · {item.changes} · {new Date(item.at).toLocaleDateString()}{item.undone ? ' · undone' : ''}</Text>
        {!item.undone && <TextButton title="Undo" onPress={() => { importPick('undo an import'); undo(item) }} />}
      </View>)}
    </View>}
  </Page>
}
