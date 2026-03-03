"use client";

interface TextEditorProps {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  success?: boolean;
  saving: boolean;
  onSave: () => void;
  onReload: () => void;
  saveLabel?: string;
  reloadLabel?: string;
}

const textareaStyle: React.CSSProperties = {
  flex: 1,
  background: "var(--input-bg)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: 8,
  color: "var(--text)",
  fontSize: 11,
  fontFamily: "monospace",
  resize: "none",
  outline: "none",
};

export function TextEditor({
  value,
  onChange,
  error,
  success,
  saving,
  onSave,
  onReload,
  saveLabel = "Save",
  reloadLabel = "Reload",
}: TextEditorProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, height: "100%" }}>
      {error && <div style={{ color: "var(--red)", fontSize: 11 }}>{error}</div>}
      {success && <div style={{ color: "var(--green)", fontSize: 11 }}>Saved</div>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        style={textareaStyle}
      />
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            background: "var(--accent)",
            color: "var(--text)",
            border: "none",
            borderRadius: 4,
            padding: "4px 12px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {saving ? "Saving..." : saveLabel}
        </button>
        <button
          onClick={onReload}
          style={{
            background: "transparent",
            color: "var(--text-muted)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "4px 12px",
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          {reloadLabel}
        </button>
      </div>
    </div>
  );
}
