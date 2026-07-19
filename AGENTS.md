<!-- kalamu:agents -->

## Kalamu

This repo tracks deferred work in a Kalamu outline (`.kalamu/outline.jsonl`). Use the `kalamu` CLI (or `npx kalamu`) — never edit the file by hand. `kalamu next` returns the most urgent open task; record work you discover but don't do with `kalamu add` instead of TODO comments.

Whenever your work needs the human to do something (a decision, a credential, a manual step outside the repo), don't just say so in chat — also record it so it survives the conversation:

```bash
kalamu add --kind task --text "<what the human must do>" --assign human
```

Human-assigned tasks never surface in `kalamu next`, so agents won't pick them up.

Nodes with `kind: "discussion"` are conversations to have with the human, never coding work — `kalamu next` never returns them and you must never implement one unprompted. When the human brings one to you (a pasted discussion prompt, or a topic to raise with `kalamu add --kind discussion`), discuss only: make no code changes, record the outcome as child bullets under the discussion node, then mark it done.
<!-- /kalamu:agents -->
