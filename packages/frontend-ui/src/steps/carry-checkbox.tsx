"use client";

import {
  fontSize,
  fontWeight,
  palette,
  rings,
} from "../shared/design-tokens.js";

export function CarryCheckboxItem({
  inputId,
  checked,
  onChange,
  label,
  disabled,
}: {
  inputId: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <label
      htmlFor={inputId}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 40,
        paddingLeft: 4,
        paddingRight: 8,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1,
        userSelect: "none",
        borderRadius: 6,
      }}
    >
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="bk-checkbox-input"
      />
      <span
        className="bk-checkbox-visual"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 20,
          height: 20,
          borderRadius: 5,
          border: checked
            ? `1px solid ${palette.brand}`
            : `1.5px solid ${palette.borderStrong}`,
          background: checked ? palette.brand : palette.surface,
          flexShrink: 0,
          transition: "background 100ms ease, border-color 100ms ease",
        }}
      >
        {checked ? (
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l4 4 10-10"
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
      <span
        style={{
          fontSize: fontSize.base,
          fontWeight: fontWeight.medium,
          color: palette.text,
          lineHeight: 1.5,
        }}
      >
        {label}
      </span>
    </label>
  );
}

const checkboxStyles = `
  .bk-checkbox-input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .bk-checkbox-input:focus-visible + .bk-checkbox-visual {
    box-shadow: ${rings.brandFocus};
  }
`;

export function CheckboxStyles() {
  return <style>{checkboxStyles}</style>;
}
