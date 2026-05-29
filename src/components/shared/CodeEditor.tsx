import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, drawSelection, highlightActiveLine } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { StreamLanguage, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { tags } from "@lezer/highlight";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

const appTheme = EditorView.theme({
  "&": {
    fontSize: "13px",
    background: "transparent",
    color: "var(--color-text-primary, #e0e0e0)",
  },
  ".cm-content": {
    padding: "10px 12px",
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    caretColor: "var(--color-accent, #CDFF00)",
    minHeight: "120px",
  },
  ".cm-line": { padding: "0" },
  ".cm-cursor": { borderLeftColor: "var(--color-accent, #CDFF00)", borderLeftWidth: "2px" },
  ".cm-selectionBackground, ::selection": {
    background: "color-mix(in srgb, var(--color-accent, #CDFF00) 20%, transparent) !important",
  },
  ".cm-activeLine": { background: "rgba(255,255,255,0.04)" },
  ".cm-focused": { outline: "none" },
  "&.cm-focused": { outline: "none" },
  ".cm-placeholder": { color: "var(--color-text-faint, #555)", fontStyle: "normal" },
}, { dark: true });

const shellHighlight = HighlightStyle.define([
  { tag: tags.keyword,        color: "#c792ea" },
  { tag: tags.string,         color: "#c3e88d" },
  { tag: tags.comment,        color: "#546e7a", fontStyle: "italic" },
  { tag: tags.operator,       color: "#89ddff" },
  { tag: tags.variableName,   color: "#82aaff" },
  { tag: tags.number,         color: "#f78c6c" },
  { tag: tags.meta,           color: "#ffcb6b" },
  { tag: tags.name,           color: "#e0e0e0" },
]);

export default function CodeEditor({ value, onChange, placeholder, minHeight = "120px" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Prevent the onChange-triggered external update from re-syncing and
  // resetting cursor position on every keystroke.
  const ignoreNextUpdate = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          drawSelection(),
          highlightActiveLine(),
          StreamLanguage.define(shell),
          syntaxHighlighting(shellHighlight),
          appTheme,
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              ignoreNextUpdate.current = true;
              onChange(update.state.doc.toString());
            }
          }),
          EditorView.contentAttributes.of({ "data-enable-grammarly": "false" }),
          ...(placeholder
            ? [EditorView.domEventHandlers({}), placeholderExtension(placeholder)]
            : []),
        ],
      }),
      parent: containerRef.current,
    });

    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. form reset) without moving the cursor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (ignoreNextUpdate.current) {
      ignoreNextUpdate.current = false;
      return;
    }
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      style={{ minHeight }}
      className="w-full bg-surface-3 border border-stroke rounded overflow-auto focus-within:border-accent transition-colors [&_.cm-editor]:w-full"
    />
  );
}

// Minimal placeholder extension — CodeMirror 6 dropped built-in placeholder
// in the view package; reproduce it with a DOM event handler.
function placeholderExtension(text: string) {
  return EditorView.domEventHandlers({
    focus(_, view) {
      view.dom.querySelector(".cm-placeholder-el")?.remove();
    },
    blur(_, view) {
      if (!view.state.doc.length) attachPlaceholder(view, text);
    },
  });
}

function attachPlaceholder(view: EditorView, text: string) {
  if (view.dom.querySelector(".cm-placeholder-el")) return;
  const el = document.createElement("div");
  el.className = "cm-placeholder-el";
  el.style.cssText =
    "position:absolute;top:10px;left:12px;pointer-events:none;color:var(--color-text-faint,#555);font-family:var(--font-mono,'JetBrains Mono',monospace);font-size:13px;";
  el.textContent = text;
  view.dom.querySelector(".cm-content")?.parentElement?.appendChild(el);
}
