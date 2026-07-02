import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Switch } from "../ui/switch";
import { useTerminalSettings, TERMINAL_FONTS, TERMINAL_THEMES, CURSOR_STYLES, fontCss } from "../../lib/terminalSettings";
import { settingsCommands } from "../../lib/commands/settings";
import { SectionHeader, Row, RowLabel } from "./SettingsShared";

const LINE_HEIGHT_OPTIONS = Array.from({ length: 30 }, (_, i) => i + 1);

interface TerminalSettingsProps {
  initialSettings: Record<string, string>;
  flashSaved: () => void;
}

export default function TerminalSettings({ initialSettings, flashSaved }: TerminalSettingsProps) {
  const { fontSize, lineHeight, scrollback, copyOnSelect, ghostSuggestions, fontFamily, termTheme, cursorStyle, setFontSize, setLineHeight, setScrollback, setCopyOnSelect, setGhostSuggestions, setFontFamily, setTermTheme, setCursorStyle } =
    useTerminalSettings();

  const [keepaliveInterval, setKeepaliveInterval] = useState("0");
  const [defaultTerminal, setDefaultTerminal] = useState("Terminal");

  useEffect(() => {
    if (initialSettings.ssh_keepalive_interval != null) setKeepaliveInterval(initialSettings.ssh_keepalive_interval);
    if (initialSettings.default_terminal != null) setDefaultTerminal(initialSettings.default_terminal);
  }, [initialSettings]);

  const saveKeepalive = (v: string | null) => {
    if (v === null) return;
    setKeepaliveInterval(v);
    settingsCommands.setSetting("ssh_keepalive_interval", v).catch(() => {});
    flashSaved();
  };

  const saveDefaultTerminal = (v: string | null) => {
    if (v === null) return;
    setDefaultTerminal(v);
    settingsCommands.setSetting("default_terminal", v).catch(() => {});
    flashSaved();
  };

  return (
    <div>
      <SectionHeader title="Terminal" description="Font changes apply to new sessions. Theme applies immediately." />

      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">Colour theme</p>
      <div className="grid grid-cols-5 gap-2 mb-6">
        {TERMINAL_THEMES.map(({ id, label, bg, fg }) => (
          <button
            key={id}
            onClick={() => { setTermTheme(id); flashSaved(); }}
            title={label}
            className={`rounded-lg border-2 overflow-hidden transition-all ${
              termTheme === id ? "border-accent" : "border-transparent hover:border-stroke"
            }`}
          >
            <div className="h-10 flex items-center justify-center gap-0.5 px-1" style={{ backgroundColor: bg }}>
              <span className="font-mono text-[9px] leading-none select-none" style={{ color: fg }}>{">"}</span>
              <span className="inline-block w-[5px] h-[9px] rounded-[1px]" style={{ backgroundColor: fg, opacity: 0.85 }} />
            </div>
            <div className="bg-surface-2 py-0.5 px-1">
              <p className={`text-[10px] leading-tight truncate ${termTheme === id ? "text-accent-fg" : "text-secondary"}`}>{label}</p>
            </div>
          </button>
        ))}
      </div>

      <Row>
        <div className="min-w-0 mr-6">
          <p className="text-sm text-white font-medium">Font</p>
          <p className="text-meta text-muted mt-0.5 truncate" style={{ fontFamily: fontCss(fontFamily) }}>the quick brown fox</p>
        </div>
        <Select
          value={fontFamily}
          onValueChange={(value) => { setFontFamily(value as typeof fontFamily); flashSaved(); }}
        >
          <SelectTrigger className="h-10 shrink-0">
            <SelectValue>
              {(val) => TERMINAL_FONTS.find((f) => f.id === val)?.label ?? String(val)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TERMINAL_FONTS.map(({ id, label }) => (
              <SelectItem key={id} value={id} label={label}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row>
        <RowLabel title="Font size" />
        <Select
          value={String(fontSize)}
          onValueChange={(value) => { setFontSize(Number(value)); flashSaved(); }}
        >
          <SelectTrigger className="h-10 shrink-0">
            <SelectValue>{(val) => `${val}px`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {[10, 12, 13, 14, 16, 18, 20].map((n) => (
              <SelectItem key={n} value={String(n)} label={`${n}px`}>{n}px</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row>
        <RowLabel title="Line height" />
        <Select
          value={String(lineHeight)}
          onValueChange={(value) => { setLineHeight(Number(value)); flashSaved(); }}
        >
          <SelectTrigger className="h-10 shrink-0">
            <SelectValue>{(val) => `${val}px`}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LINE_HEIGHT_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)} label={`${n}px`}>{n}px</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row>
        <RowLabel title="Cursor style" />
        <Select
          value={cursorStyle}
          onValueChange={(value) => { setCursorStyle(value as typeof cursorStyle); flashSaved(); }}
        >
          <SelectTrigger className="h-10 shrink-0">
            <SelectValue>
              {(val) => CURSOR_STYLES.find((c) => c.id === val)?.label ?? String(val)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CURSOR_STYLES.map(({ id, label }) => (
              <SelectItem key={id} value={id} label={label}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row>
        <RowLabel title="Scrollback lines" description="Lines retained above the viewport" />
        <Select
          value={String(scrollback)}
          onValueChange={(value) => { setScrollback(Number(value)); flashSaved(); }}
        >
          <SelectTrigger className="h-10 shrink-0">
            <SelectValue>
              {(val) => ({"500":"500","1000":"1 000","5000":"5 000","10000":"10 000","50000":"50 000"} as Record<string,string>)[String(val)] ?? String(val)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {[[500,"500"],[1000,"1 000"],[5000,"5 000"],[10000,"10 000"],[50000,"50 000"]].map(([v, l]) => (
              <SelectItem key={v} value={String(v)} label={String(l)}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>

      <Row>
        <RowLabel title="Copy on select" description="Automatically copy selected text to clipboard" />
        <Switch
          aria-label="Copy on select"
          checked={copyOnSelect}
          onCheckedChange={(checked) => { setCopyOnSelect(checked); flashSaved(); }}
        />
      </Row>

      <Row>
        <RowLabel title="Ghost suggestions" description="Show dimmed command completions from history; accept with →" />
        <Switch
          aria-label="Ghost suggestions"
          checked={ghostSuggestions}
          onCheckedChange={(checked) => { setGhostSuggestions(checked); flashSaved(); }}
        />
      </Row>

      <Row>
        <RowLabel title="SSH keepalive" description="Send periodic packets to prevent idle session drops" />
        <Select value={keepaliveInterval} onValueChange={saveKeepalive}>
          <SelectTrigger className="h-10 shrink-0">
            <SelectValue>
              {(val) => ({"0":"Disabled","30":"30 s","60":"60 s","120":"2 min","300":"5 min"} as Record<string,string>)[String(val)] ?? String(val)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Disabled</SelectItem>
            <SelectItem value="30">30 s</SelectItem>
            <SelectItem value="60">60 s</SelectItem>
            <SelectItem value="120">2 min</SelectItem>
            <SelectItem value="300">5 min</SelectItem>
          </SelectContent>
        </Select>
      </Row>

      <Row>
        <RowLabel title="Default terminal" description="App used by 'Open in Terminal' for external SSH sessions" />
        <Select value={defaultTerminal} onValueChange={saveDefaultTerminal}>
          <SelectTrigger className="h-10 shrink-0">
            <SelectValue>{(val) => val === "iTerm" ? "iTerm2" : String(val)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Terminal">Terminal</SelectItem>
            <SelectItem value="iTerm">iTerm2</SelectItem>
          </SelectContent>
        </Select>
      </Row>
    </div>
  );
}
