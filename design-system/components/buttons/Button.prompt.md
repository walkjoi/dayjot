DayJot's button. Solid indigo `primary` for confirming actions; `space` for the dark marketing surface.

```jsx
<Button variant="primary" onClick={save}>Start free trial</Button>
<Button variant="white" size="sm" leadingIcon={<Mic size={14} />}>Record</Button>
<Button variant="space">Start free trial</Button>
```

Variants: `primary` (solid indigo-600, hover → indigo-500), `secondary` (soft indigo-100/700), `white` (bordered, hover text → purple), `text` & `ghost` (chromeless), `space` (glass + inset purple glow, for `.dayjot-space`). Sizes `sm` | `md`. Sentence-case, verb-led labels — never Title Case.
