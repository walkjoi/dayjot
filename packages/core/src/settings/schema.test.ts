import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, settingsSchema } from './schema'

describe('settingsSchema', () => {
  it('defaults every key on an empty document (fresh install)', () => {
    expect(settingsSchema.parse({})).toEqual({
      editorMarkdownSyntax: 'hide',
      editorSpellCheck: true,
      editorDefaultBullet: true,
      editorBulletAfterHeading: true,
      editorSmoothCaretAnimation: true,
      editorTextSize: 'small',
      editorFullWidth: false,
      sidebarWidth: 260,
      contextSidebarWidth: 320,
      contactsEnabled: false,
      mobileOnboarded: false,
      mobileStorage: 'local',
      mobileGraphName: '',
      theme: 'system',
      timeFormat: '12h',
      dateFormat: 'mdy',
      weekStartDay: 'monday',
      allNotesFilterTags: ['book', 'link', 'person'],
      calendarEnabled: false,
      calendarIds: [],
      graphColors: {},
    })
    expect(DEFAULT_SETTINGS.editorMarkdownSyntax).toBe('hide')
    expect(DEFAULT_SETTINGS.editorSpellCheck).toBe(true)
    expect(DEFAULT_SETTINGS.editorDefaultBullet).toBe(true)
    expect(DEFAULT_SETTINGS.editorBulletAfterHeading).toBe(true)
    expect(DEFAULT_SETTINGS.editorSmoothCaretAnimation).toBe(true)
    expect(DEFAULT_SETTINGS.editorTextSize).toBe('small')
    expect(DEFAULT_SETTINGS.editorFullWidth).toBe(false)
    expect(DEFAULT_SETTINGS.sidebarWidth).toBe(260)
    expect(DEFAULT_SETTINGS.contextSidebarWidth).toBe(320)
    expect(DEFAULT_SETTINGS.contactsEnabled).toBe(false)
    expect(DEFAULT_SETTINGS.mobileOnboarded).toBe(false)
    expect(DEFAULT_SETTINGS.mobileStorage).toBe('local')
    expect(DEFAULT_SETTINGS.theme).toBe('system')
    expect(DEFAULT_SETTINGS.timeFormat).toBe('12h')
    expect(DEFAULT_SETTINGS.dateFormat).toBe('mdy')
    expect(DEFAULT_SETTINGS.weekStartDay).toBe('monday')
    expect(DEFAULT_SETTINGS.allNotesFilterTags).toEqual(['book', 'link', 'person'])
    expect(DEFAULT_SETTINGS.calendarEnabled).toBe(false)
    expect(DEFAULT_SETTINGS.calendarIds).toEqual([])
    expect(DEFAULT_SETTINGS.graphColors).toEqual({})
  })

  it('accepts valid values', () => {
    expect(settingsSchema.parse({ editorMarkdownSyntax: 'show' }).editorMarkdownSyntax).toBe('show')
    expect(settingsSchema.parse({ editorMarkdownSyntax: 'hide' }).editorMarkdownSyntax).toBe('hide')
    expect(settingsSchema.parse({ editorMarkdownSyntax: 'hybrid' }).editorMarkdownSyntax).toBe('hybrid')
    expect(settingsSchema.parse({ editorSpellCheck: false }).editorSpellCheck).toBe(false)
    expect(settingsSchema.parse({ editorSpellCheck: true }).editorSpellCheck).toBe(true)
    expect(settingsSchema.parse({ editorDefaultBullet: false }).editorDefaultBullet).toBe(false)
    expect(settingsSchema.parse({ editorDefaultBullet: true }).editorDefaultBullet).toBe(true)
    expect(
      settingsSchema.parse({ editorBulletAfterHeading: false }).editorBulletAfterHeading,
    ).toBe(false)
    expect(
      settingsSchema.parse({ editorBulletAfterHeading: true }).editorBulletAfterHeading,
    ).toBe(true)
    expect(
      settingsSchema.parse({ editorSmoothCaretAnimation: false }).editorSmoothCaretAnimation,
    ).toBe(false)
    expect(
      settingsSchema.parse({ editorSmoothCaretAnimation: true }).editorSmoothCaretAnimation,
    ).toBe(true)
    expect(settingsSchema.parse({ editorTextSize: 'small' }).editorTextSize).toBe('small')
    expect(settingsSchema.parse({ editorTextSize: 'medium' }).editorTextSize).toBe('medium')
    expect(settingsSchema.parse({ editorTextSize: 'large' }).editorTextSize).toBe('large')
    expect(settingsSchema.parse({ editorFullWidth: false }).editorFullWidth).toBe(false)
    expect(settingsSchema.parse({ editorFullWidth: true }).editorFullWidth).toBe(true)
    expect(settingsSchema.parse({ sidebarWidth: 300 }).sidebarWidth).toBe(300)
    expect(settingsSchema.parse({ sidebarWidth: 200 }).sidebarWidth).toBe(200)
    expect(settingsSchema.parse({ sidebarWidth: 480 }).sidebarWidth).toBe(480)
    expect(settingsSchema.parse({ contextSidebarWidth: 360 }).contextSidebarWidth).toBe(360)
    expect(settingsSchema.parse({ contextSidebarWidth: 240 }).contextSidebarWidth).toBe(240)
    expect(settingsSchema.parse({ theme: 'dark' }).theme).toBe('dark')
    expect(settingsSchema.parse({ theme: 'light' }).theme).toBe('light')
    expect(settingsSchema.parse({ theme: 'system' }).theme).toBe('system')
    expect(settingsSchema.parse({ timeFormat: '24h' }).timeFormat).toBe('24h')
    expect(settingsSchema.parse({ timeFormat: '12h' }).timeFormat).toBe('12h')
    expect(settingsSchema.parse({ dateFormat: 'iso' }).dateFormat).toBe('iso')
    expect(settingsSchema.parse({ dateFormat: 'dmy' }).dateFormat).toBe('dmy')
    expect(settingsSchema.parse({ dateFormat: 'mdy' }).dateFormat).toBe('mdy')
    expect(settingsSchema.parse({ weekStartDay: 'monday' }).weekStartDay).toBe('monday')
    expect(settingsSchema.parse({ weekStartDay: 'sunday' }).weekStartDay).toBe('sunday')
    expect(settingsSchema.parse({ contactsEnabled: true }).contactsEnabled).toBe(true)
    expect(settingsSchema.parse({ contactsEnabled: false }).contactsEnabled).toBe(false)
    expect(
      settingsSchema.parse({ allNotesFilterTags: ['meeting'] }).allNotesFilterTags,
    ).toEqual(['meeting'])
    expect(settingsSchema.parse({ allNotesFilterTags: [] }).allNotesFilterTags).toEqual([])
    expect(settingsSchema.parse({ calendarEnabled: true }).calendarEnabled).toBe(true)
    expect(settingsSchema.parse({ calendarEnabled: false }).calendarEnabled).toBe(false)
    expect(settingsSchema.parse({ calendarIds: ['cal-1', 'cal-2'] }).calendarIds).toEqual([
      'cal-1',
      'cal-2',
    ])
    expect(settingsSchema.parse({ calendarIds: [] }).calendarIds).toEqual([])
    expect(settingsSchema.parse({ mobileStorage: 'icloud' }).mobileStorage).toBe('icloud')
    expect(settingsSchema.parse({ mobileStorage: 'local' }).mobileStorage).toBe('local')
  })

  it('degrades an invalid value to its default instead of failing the load', () => {
    expect(settingsSchema.parse({ editorMarkdownSyntax: 'sideways' }).editorMarkdownSyntax).toBe('hide')
    expect(settingsSchema.parse({ editorMarkdownSyntax: 42 }).editorMarkdownSyntax).toBe('hide')
    expect(settingsSchema.parse({ editorSpellCheck: 'off' }).editorSpellCheck).toBe(true)
    expect(settingsSchema.parse({ editorSpellCheck: 0 }).editorSpellCheck).toBe(true)
    expect(settingsSchema.parse({ editorDefaultBullet: 'on' }).editorDefaultBullet).toBe(true)
    expect(settingsSchema.parse({ editorDefaultBullet: 0 }).editorDefaultBullet).toBe(true)
    expect(
      settingsSchema.parse({ editorBulletAfterHeading: 'on' }).editorBulletAfterHeading,
    ).toBe(true)
    expect(settingsSchema.parse({ editorBulletAfterHeading: 0 }).editorBulletAfterHeading).toBe(true)
    expect(
      settingsSchema.parse({ editorSmoothCaretAnimation: 'on' }).editorSmoothCaretAnimation,
    ).toBe(true)
    expect(
      settingsSchema.parse({ editorSmoothCaretAnimation: 0 }).editorSmoothCaretAnimation,
    ).toBe(true)
    expect(settingsSchema.parse({ editorTextSize: 'huge' }).editorTextSize).toBe('small')
    expect(settingsSchema.parse({ editorTextSize: 3 }).editorTextSize).toBe('small')
    expect(settingsSchema.parse({ editorFullWidth: 'yes' }).editorFullWidth).toBe(false)
    expect(settingsSchema.parse({ editorFullWidth: 1 }).editorFullWidth).toBe(false)
    expect(settingsSchema.parse({ sidebarWidth: 'wide' }).sidebarWidth).toBe(260)
    // Out-of-range numbers clamp instead of resetting: a near-miss hand-edit
    // keeps its intent.
    expect(settingsSchema.parse({ sidebarWidth: 100 }).sidebarWidth).toBe(200)
    expect(settingsSchema.parse({ sidebarWidth: 9000 }).sidebarWidth).toBe(480)
    expect(settingsSchema.parse({ sidebarWidth: 315.4 }).sidebarWidth).toBe(315)
    expect(settingsSchema.parse({ contextSidebarWidth: 'wide' }).contextSidebarWidth).toBe(320)
    expect(settingsSchema.parse({ contextSidebarWidth: 100 }).contextSidebarWidth).toBe(240)
    expect(settingsSchema.parse({ contextSidebarWidth: 9000 }).contextSidebarWidth).toBe(480)
    expect(settingsSchema.parse({ theme: 'sepia' }).theme).toBe('system')
    expect(settingsSchema.parse({ theme: 7 }).theme).toBe('system')
    expect(settingsSchema.parse({ timeFormat: '36h' }).timeFormat).toBe('12h')
    expect(settingsSchema.parse({ timeFormat: 24 }).timeFormat).toBe('12h')
    expect(settingsSchema.parse({ dateFormat: 'ymd' }).dateFormat).toBe('mdy')
    expect(settingsSchema.parse({ dateFormat: 10 }).dateFormat).toBe('mdy')
    expect(settingsSchema.parse({ weekStartDay: 'saturday' }).weekStartDay).toBe('monday')
    expect(settingsSchema.parse({ weekStartDay: 42 }).weekStartDay).toBe('monday')
    expect(settingsSchema.parse({ contactsEnabled: 'yes' }).contactsEnabled).toBe(false)
    expect(settingsSchema.parse({ contactsEnabled: 1 }).contactsEnabled).toBe(false)
    expect(settingsSchema.parse({ allNotesFilterTags: 'book' }).allNotesFilterTags).toEqual([
      'book',
      'link',
      'person',
    ])
    expect(settingsSchema.parse({ allNotesFilterTags: [7] }).allNotesFilterTags).toEqual([
      'book',
      'link',
      'person',
    ])
    expect(settingsSchema.parse({ calendarEnabled: 'yes' }).calendarEnabled).toBe(false)
    expect(settingsSchema.parse({ calendarEnabled: 1 }).calendarEnabled).toBe(false)
    expect(settingsSchema.parse({ calendarIds: 'cal-1' }).calendarIds).toEqual([])
    expect(settingsSchema.parse({ calendarIds: [7] }).calendarIds).toEqual([])
    expect(settingsSchema.parse({ mobileStorage: 'dropbox' }).mobileStorage).toBe('local')
    expect(settingsSchema.parse({ mobileStorage: 1 }).mobileStorage).toBe('local')
  })

  it('preserves unknown keys so newer-version settings survive a round trip', () => {
    const parsed = settingsSchema.parse({ editorMarkdownSyntax: 'show', futureKey: true })
    expect(parsed).toEqual({
      editorMarkdownSyntax: 'show',
      editorSpellCheck: true,
      editorDefaultBullet: true,
      editorBulletAfterHeading: true,
      editorSmoothCaretAnimation: true,
      editorTextSize: 'small',
      editorFullWidth: false,
      sidebarWidth: 260,
      contextSidebarWidth: 320,
      contactsEnabled: false,
      mobileOnboarded: false,
      mobileStorage: 'local',
      mobileGraphName: '',
      theme: 'system',
      timeFormat: '12h',
      dateFormat: 'mdy',
      weekStartDay: 'monday',
      allNotesFilterTags: ['book', 'link', 'person'],
      calendarEnabled: false,
      calendarIds: [],
      graphColors: {},
      futureKey: true,
    })
  })

  describe('graphColors', () => {
    it('passes valid entries through', () => {
      const colors = { '/graphs/work': 'teal', '/graphs/home': 'amber' }
      expect(settingsSchema.parse({ graphColors: colors }).graphColors).toEqual(colors)
    })

    it('drops a corrupt entry without losing the rest', () => {
      const parsed = settingsSchema.parse({
        graphColors: { '/graphs/work': 'teal', '/graphs/home': 'chartreuse', '/graphs/x': 42 },
      })
      expect(parsed.graphColors).toEqual({ '/graphs/work': 'teal' })
    })

    it('degrades a non-object value to the empty record', () => {
      expect(settingsSchema.parse({ graphColors: 'teal' }).graphColors).toEqual({})
      expect(settingsSchema.parse({ graphColors: ['teal'] }).graphColors).toEqual({})
    })
  })

})
