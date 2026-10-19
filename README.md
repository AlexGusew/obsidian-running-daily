# Running Daily

Keep your daily log in one note. Running Daily adds a heading for today, moves unfinished tasks from the previous day, and lets task checkboxes cycle through todo, in progress and done.

## Why

Daily notes spread your work over many files. A single running note keeps the backlog, today and the past days in one place, so you can scroll back, search and link without opening a new file every morning. The note stays plain Markdown and reads fine in any editor.

## File format

```markdown
## Backlog
- [ ] Something not scheduled

## Daily

### [[2026-10-15]]
- [x] Done thing
- [-] Cancelled thing
- Plain note bullet
	- nested note

### [[2026-10-16]]
- [/] In progress thing
	- [ ] sub task
- [ ] Todo thing
```

- Day headings live in the section set in **Section heading** (default `Daily`), one level below it. Only headings that start at the beginning of a line count; headings inside lists, code blocks or front matter are ignored.
- New days are added at the end of that section. The section is created at the end of the note if it is missing.
- Day headings are links to the date (`[[2026-10-16]]`) by default. Plain dates, `[[date|alias]]` and a trailing `:` are also recognized.

## Task statuses

| Markdown | Status      |
| -------- | ----------- |
| `- [ ]`  | Todo        |
| `- [/]`  | In progress |
| `- [x]`  | Done        |
| `- [-]`  | Cancelled   |

Clicking or tapping a task checkbox in Live Preview or Reading view cycles its status instead of just checking it: todo → in progress → done → todo. Cancelled tasks, `[X]` and unknown statuses go back to todo. Set a task to cancelled with a command or from the editor context menu. In Source mode there are no checkboxes; use the commands instead.

Click cycling works in every note by default. Turn off **Cycle status in all notes** to limit it to the running daily note; other notes then keep Obsidian's normal checkbox behaviour.

## Adding today

When you open the note, today's heading is added if it's missing (turn this off with **Add today automatically**; weekends are skipped by default). The check repeats when the date changes while the note is open.

When a new day is added:

- Top-level tasks of the previous day that are todo or in progress move to today, together with everything nested under them.
- Done and cancelled tasks, plain bullets and other text stay where they are, including their nested items.
- If nothing is left under the previous day, its heading is removed.
- Tasks inside code blocks are never moved.

The cursor is placed at the end of today's block (in Reading view, the note scrolls to today).

Nothing is changed if the note has an unclosed code block or front matter, or if the daily section is a level 6 heading. If the note is open with unsaved changes, the plugin waits a few seconds for them to be saved before adding today's heading.

## Commands

| Command                  | What it does                                                                   |
| ------------------------ | ------------------------------------------------------------------------------ |
| Open today               | Opens the note (creates it if needed), adds today's heading and jumps to it.   |
| Cycle task status        | Cycles every task in the selection: todo → in progress → done → todo.          |
| Mark task as todo        | Sets every task in the selection to todo.                                      |
| Mark task as in progress | Sets every task in the selection to in progress.                               |
| Mark task as done        | Sets every task in the selection to done.                                      |
| Mark task as cancelled   | Sets every task in the selection to cancelled.                                 |

The ribbon icon runs **Open today**. Right-click a task in the editor to set its status. No hotkeys are set by default; add your own in **Settings → Hotkeys**.

## Settings

| Setting                     | Default            | Description                                                         |
| --------------------------- | ------------------ | ------------------------------------------------------------------- |
| Note path                   | `Running daily.md` | Path of the note, relative to the vault root.                       |
| Section heading             | `Daily`            | Heading of the section that contains the day headings.              |
| Date format                 | `YYYY-MM-DD`       | [Moment.js format](https://momentjs.com/docs/#/displaying/format/) of day headings. |
| Link dates                  | On                 | Write day headings as `[[date]]` links.                             |
| Add today automatically     | On                 | Add today's heading when the note is opened.                        |
| Skip weekends               | On                 | Don't add today's heading automatically on Saturday and Sunday.     |
| Carry over unfinished tasks | On                 | Move todo and in-progress tasks from the previous day to today.     |
| Remove empty days           | On                 | Remove the previous day heading when nothing is left under it.      |
| Cycle status in all notes   | On                 | When off, clicking a checkbox cycles its status only in the running daily note. |

## Installation

### Community plugins

Once the plugin is listed: open **Settings → Community plugins → Browse**, search for "Running Daily", select **Install**, then **Enable**.

### BRAT

1. Install and enable [BRAT](https://github.com/TfTHacker/obsidian42-brat).
2. Run **BRAT: Add a beta plugin for testing** and enter `AlexGusew/obsidian-running-daily`.
3. Enable Running Daily in **Settings → Community plugins**.

### Manual

1. Download `main.js`, `manifest.json` and `styles.css` from the latest [release](https://github.com/AlexGusew/obsidian-running-daily/releases).
2. Copy them to `<vault>/.obsidian/plugins/running-daily/`.
3. Reload Obsidian and enable Running Daily in **Settings → Community plugins**.

## Development

Requires Node.js 24.

```bash
npm install      # install dependencies
npm run dev      # build in watch mode
npm run build    # type-check and build main.js
npm test         # run unit tests (node:test)
npm run lint     # lint with eslint-plugin-obsidianmd
```

To try changes, link or copy the repository folder to `<vault>/.obsidian/plugins/running-daily/` and reload Obsidian.

## License

[MIT](LICENSE)
