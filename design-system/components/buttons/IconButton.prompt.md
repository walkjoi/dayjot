A square, chromeless icon button — sidebar arrows, toolbar actions. Hover/active paints DayJot's grey wash.

```jsx
<IconButton label="Record audio"><Mic size={16} /></IconButton>
<IconButton label="Back" active><ChevronLeft size={16} /></IconButton>
```

Pass a ~16px icon as children. `active` keeps the wash on for selected state.
