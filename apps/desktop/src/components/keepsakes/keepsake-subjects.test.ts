import { describe, expect, it } from 'vitest'
import type { Keepsake, KeepsakeSubject } from '@dayjot/core'
import { groupKeepsakesBySubject, keepsakeMarkdownUnder, NO_SUBJECT_KEY } from './keepsake-subjects'

function subject(target: string, notePath: string | null = `notes/${target.toLowerCase()}.md`): KeepsakeSubject {
  return { target, notePath, key: notePath ?? `link:${target.toLowerCase()}` }
}

function keepsake(text: string, subjects: KeepsakeSubject[] = [], lead: string | null = null): Keepsake {
  const markdown = lead === null ? text : `[[${lead}]] ${text}`
  return {
    notePath: `daily/${text}.md`,
    noteTitle: text,
    dailyDate: '2026-09-23',
    updatedAt: 0,
    markerOffset: 0,
    markerIndex: 0,
    kind: 'line',
    text,
    markdown,
    links: subjects.map((entry) => entry.target),
    leadLink: lead,
    markdownAfterLead: text,
    subjects,
  }
}

describe('groupKeepsakesBySubject', () => {
  it('orders subjects by their newest keepsake and keeps each group newest first', () => {
    const groups = groupKeepsakesBySubject([
      keepsake('local delivery', [subject('SD')]),
      keepsake('GCD', [subject('DSA')]),
      keepsake('CDC', [subject('SD')]),
    ])

    expect(groups.map((group) => group.label)).toEqual(['SD', 'DSA'])
    expect(groups[0]?.keepsakes.map((entry) => entry.text)).toEqual(['local delivery', 'CDC'])
  })

  it('files a keepsake under every subject it names', () => {
    const groups = groupKeepsakesBySubject([keepsake('both', [subject('SD'), subject('Kafka')])])

    expect(groups.map((group) => group.label)).toEqual(['SD', 'Kafka'])
    expect(groups.every((group) => group.keepsakes.length === 1)).toBe(true)
  })

  it('gathers keepsakes naming no subject last', () => {
    const groups = groupKeepsakesBySubject([keepsake('unlinked'), keepsake('GCD', [subject('DSA')])])

    expect(groups.map((group) => group.key)).toEqual(['notes/dsa.md', NO_SUBJECT_KEY])
    expect(groups[1]?.label).toBeNull()
  })

  it('labels a subject the way it is most often written', () => {
    const note = 'notes/dsa-记忆点.md'
    const groups = groupKeepsakesBySubject([
      keepsake('a', [subject('dsa', note)]),
      keepsake('b', [subject('DSA', note)]),
      keepsake('c', [subject('DSA', note)]),
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.label).toBe('DSA')
    expect(groups[0]?.notePath).toBe(note)
  })

  it('breaks a spelling tie toward the newest', () => {
    const note = 'notes/sd.md'
    const groups = groupKeepsakesBySubject([
      keepsake('a', [subject('sd', note)]),
      keepsake('b', [subject('SD', note)]),
    ])

    expect(groups[0]?.label).toBe('sd')
  })
})

describe('keepsakeMarkdownUnder', () => {
  it('drops the leading link under the subject it names', () => {
    const entry = keepsake('GCD 最大公约数', [subject('DSA')], 'DSA')

    expect(keepsakeMarkdownUnder(entry, 'notes/dsa.md')).toBe('GCD 最大公约数')
  })

  it('keeps the link under another subject, or with no subject heading', () => {
    const entry = keepsake('about both', [subject('SD'), subject('Kafka')], 'SD')

    expect(keepsakeMarkdownUnder(entry, 'notes/kafka.md')).toBe('[[SD]] about both')
    expect(keepsakeMarkdownUnder(entry, null)).toBe('[[SD]] about both')
  })

  it('keeps a keepsake that is nothing but its subject', () => {
    const entry = { ...keepsake('', [subject('SD')], 'SD'), markdown: '[[SD]]', markdownAfterLead: '' }

    expect(keepsakeMarkdownUnder(entry, 'notes/sd.md')).toBe('[[SD]]')
  })
})
