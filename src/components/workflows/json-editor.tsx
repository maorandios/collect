"use client";

type JsonEditorProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
};

export function JsonEditor({ id, value, onChange }: JsonEditorProps) {
  return (
    <textarea
      id={id}
      dir="ltr"
      lang="en"
      spellCheck={false}
      wrap="off"
      autoCorrect="off"
      autoCapitalize="off"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-full min-h-0 w-full resize-none overflow-auto rounded-lg border border-input bg-surface p-4 font-mono text-sm leading-6 [field-sizing:fixed]"
      style={{
        direction: "ltr",
        textAlign: "left",
        fontFamily: "monospace",
        unicodeBidi: "isolate",
        whiteSpace: "pre",
      }}
    />
  );
}
