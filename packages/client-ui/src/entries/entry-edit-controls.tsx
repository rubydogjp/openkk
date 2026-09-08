"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { EntryAccountVisualType } from "@rubydogjp/openkk-client-domain";
import type { EntryMasterAccountOption } from "@rubydogjp/openkk-client-usecases";
import {
  fontSize,
  fontWeight,
  palette,
  radii,
  shadows,
  sizes,
  typography,
} from "../shared/design-tokens.js";
import {
  useModalLifecycle,
  usePopoverLifecycle,
} from "../shared/dismissible-layer.js";
import {
  EntryAccountIcon,
  entryAccountPalette,
} from "./entry-account-visual.js";

export const entryDrawerColors = {
  text: palette.text,
  soft: palette.textSoft,
  muted: palette.textMuted,
  labelText: palette.textLabel,

  border: palette.borderStrong,

  panelBg: palette.surface,
  bg: palette.surface,
  blue: palette.brand,
  red: palette.danger,
  green: palette.success,
};

const accountTypeLabel: Record<EntryAccountVisualType, string> = {
  asset: "資産",
  liability: "負債",
  equity: "純資産",
  revenue: "収益",
  cost_of_sales: "売上原価",
  expense: "費用",
};

export function CardDivider() {
  return <div style={{ height: 1, background: palette.borderSubtle }} />;
}

export function StackedField({
  label,
  width,
  children,
}: {
  label: string;
  width?: number;
  children: ReactNode;
}) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        width: width ?? "100%",
        maxWidth: "100%",
      }}
    >
      <span
        style={{
          marginBottom: 8,
          fontSize: fontSize.base,
          fontWeight: fontWeight.semibold,
          color: entryDrawerColors.labelText,
          letterSpacing: "0.01em",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

export function AccountPicker({
  selectedId,
  value,
  accountType,
  onChange,
  options,
  fullWidth = false,
  ariaLabel,
}: {
  selectedId?: string;
  value: string;
  accountType: EntryAccountVisualType;
  onChange: (option: EntryMasterAccountOption) => void;
  options: EntryMasterAccountOption[];

  fullWidth?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { containerRef, popupRef } = usePopoverLifecycle<
    HTMLDivElement,
    HTMLDivElement
  >({ open, onDismiss: () => setOpen(false) });

  const grouped = useMemo(
    () => groupAccounts(options, query),
    [options, query],
  );
  const accountPalette = entryAccountPalette(accountType);
  const selectedLabel =
    options.find((option) => option.id === selectedId)?.selectionLabel ?? value;
  const bg = value === "" ? entryDrawerColors.bg : accountPalette.background;
  const fg =
    value === "" ? entryDrawerColors.muted : accountPalette.foreground;
  const border =
    value === "" ? entryDrawerColors.border : accountPalette.foreground;

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: fullWidth ? "100%" : undefined }}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        style={{
          height: sizes.account.tableHeight,
          width: fullWidth ? "100%" : sizes.account.tableWidth,
          boxSizing: "border-box",
          border: `1px solid ${border}`,
          borderRadius: radii.sm,
          background: bg,
          padding: "0 11px",
          fontSize: fontSize.base,
          color: fg,
          fontWeight: fontWeight.bold,
          textAlign: "left",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {value === "" ? null : (
          <EntryAccountIcon
            type={accountType}
            color={accountPalette.foreground}
            size={16}
          />
        )}
        <span
          style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value === "" ? "勘定科目を選択" : selectedLabel}
        </span>
      </button>
      {open ? (
        <div
          ref={popupRef}
          role="dialog"
          aria-label="勘定科目を選択"
          tabIndex={-1}
          style={popupStyle}
        >
          <div style={{ padding: 8, borderBottom: `1px solid ${entryDrawerColors.border}` }}>
            <input
              className="bk-d-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="勘定科目を検索"
              style={{
                width: "100%",
                boxSizing: "border-box",
                height: 30,
                padding: "0 10px",
                border: `1px solid ${entryDrawerColors.border}`,
                borderRadius: 6,
                fontSize: fontSize.sm,
                outline: "none",
              }}
            />
          </div>
          <div style={{ maxHeight: 320, overflow: "auto", padding: "4px 0" }}>
            {grouped.length === 0 ? (
              <EmptyHint>該当する科目がありません</EmptyHint>
            ) : (
              grouped.map((group) => (
                <div key={group.type}>
                  <SectionLabel>{accountTypeLabel[group.type]}</SectionLabel>
                  {group.accounts.map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      className="bk-d-menu-item"
                      onClick={() => {
                        onChange(account);
                        setOpen(false);
                        setQuery("");
                      }}
                      style={menuItemStyle}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 999,
                          background: entryAccountPalette(account.accountType)
                            .foreground,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          fontWeight:
                            account.id === selectedId
                              ? fontWeight.bold
                              : fontWeight.medium,
                        }}
                      >
                        {account.selectionLabel}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function groupAccounts(
  options: EntryMasterAccountOption[],
  query: string,
): Array<{
  type: EntryAccountVisualType;
  accounts: EntryMasterAccountOption[];
}> {
  const order: EntryAccountVisualType[] = [
    "asset",
    "liability",
    "equity",
    "revenue",
    "cost_of_sales",
    "expense",
  ];
  const lower = query.trim().toLowerCase();
  const filtered =
    lower === ""
      ? options
      : options.filter((option) =>
          option.selectionLabel.toLowerCase().includes(lower),
        );
  return order
    .map((type) => ({
      type,
      accounts: filtered.filter((option) => option.accountType === type),
    }))
    .filter((group) => group.accounts.length > 0);
}

export function SuggestionInput({
  value,
  onChange,
  options,
  placeholder,
  align = "left",
  inputMode,
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  align?: "left" | "right";
  inputMode?: "numeric" | "decimal";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const { containerRef, popupRef } = usePopoverLifecycle<
    HTMLDivElement,
    HTMLDivElement
  >({ open, onDismiss: () => setOpen(false) });

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed === "") return options;
    return options.filter((option) => option.toLowerCase().includes(trimmed));
  }, [options, query]);

  const commit = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          height: 30,
          width: "100%",
          boxSizing: "border-box",
          border: `1px solid ${value === "" ? entryDrawerColors.border : entryDrawerColors.blue}`,
          borderRadius: 999,
          background: entryDrawerColors.bg,
          padding: "0 10px",
          fontSize: fontSize.sm,
          color: value === "" ? entryDrawerColors.muted : entryDrawerColors.blue,
          fontWeight: fontWeight.regular,
          textAlign: align,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: align === "right" ? "flex-end" : "flex-start",
          fontVariantNumeric: inputMode == null ? undefined : "tabular-nums",
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
            textAlign: align,
          }}
        >
          {value === "" ? (placeholder ?? "選択") : value}
        </span>
      </button>
      {open ? (
        <div
          ref={popupRef}
          role="dialog"
          aria-label={placeholder ?? "候補を選択"}
          tabIndex={-1}
          style={popupStyle}
        >
          <div
            style={{
              padding: 8,
              borderBottom: `1px solid ${entryDrawerColors.border}`,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <input
              className="bk-d-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit(query.trim());
                }
              }}
              inputMode={inputMode}
              placeholder={placeholder ?? "入力 / 検索"}
              style={{
                flex: 1,
                height: 30,
                padding: "0 10px",
                border: `1px solid ${entryDrawerColors.border}`,
                borderRadius: 6,
                fontSize: fontSize.sm,
                outline: "none",
              }}
            />
            <button
              type="button"
              onClick={() => commit(query.trim())}
              aria-label="この値で確定"
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                border: "none",
                background: entryDrawerColors.green,
                color: "#FFFFFF",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckIcon />
            </button>
          </div>
          <div style={{ maxHeight: 260, overflow: "auto", padding: "4px 0" }}>
            {filtered.length === 0 ? (
              <EmptyHint>
                候補はありません。
                <br />
                入力した値をそのまま保存できます。
              </EmptyHint>
            ) : (
              filtered.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="bk-d-menu-item"
                  onClick={() => commit(option)}
                  style={{
                    ...menuItemStyle,
                    fontWeight:
                      option === value ? fontWeight.bold : fontWeight.medium,
                  }}
                >
                  {option}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TextFieldInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  return (
    <input
      className="bk-d-input"
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      style={{
        height: sizes.field.height,
        width: "100%",
        boxSizing: "border-box",
        border: `1px solid ${entryDrawerColors.border}`,
        borderRadius: radii.sm,
        background: entryDrawerColors.bg,
        padding: `0 ${sizes.field.paddingX}`,
        ...typography.input,
        color: entryDrawerColors.text,
        outline: "none",
      }}
    />
  );
}

export function BalanceIndicator({
  debitAmt,
  creditAmt,
}: {
  debitAmt: number;
  creditAmt: number;
}) {
  if (debitAmt === 0 && creditAmt === 0) {
    return (
      <div
        style={{
          fontSize: fontSize.sm,
          color: entryDrawerColors.muted,
          fontWeight: fontWeight.semibold,
        }}
      >
        金額を入力してください
      </div>
    );
  }
  if (debitAmt === creditAmt) {
    return (
      <div
        style={{
          fontSize: fontSize.sm,
          color: entryDrawerColors.green,
          fontWeight: fontWeight.bold,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <CheckIcon /> 貸借一致 ¥{debitAmt.toLocaleString()}
      </div>
    );
  }
  return (
    <div
      style={{
        fontSize: fontSize.sm,
        color: entryDrawerColors.red,
        fontWeight: fontWeight.bold,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      <WarnIcon /> 差額 ¥{Math.abs(debitAmt - creditAmt).toLocaleString()}
    </div>
  );
}

export function ValidationCard({
  messages,
  compact = false,
}: {
  messages: string[];
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      style={{
        width: "100%",
        boxSizing: "border-box",
        borderRadius: compact ? radii.sm : 12,
        border: `1px solid ${entryDrawerColors.red}2E`,
        background: `${entryDrawerColors.red}0D`,
        padding: compact ? "10px 12px" : "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: compact ? 4 : 8,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: compact ? fontSize.sm : fontSize.base,
          fontWeight: fontWeight.bold,
          color: entryDrawerColors.red,
        }}
      >
        <WarnIcon /> 入力内容を確認してください
      </div>
      {messages.map((message, index) => (
        <div
          key={index}
          style={{
            paddingLeft: 22,
            fontSize: fontSize.sm,
            color: entryDrawerColors.text,
            lineHeight: compact ? 1.45 : 1.6,
          }}
        >
          ・{message}
        </div>
      ))}
    </div>
  );
}

export function DeleteConfirmDialog(props: {
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const dismiss = () => {
    if (!props.deleting) props.onCancel();
  };
  const dialogRef = useModalLifecycle<HTMLDivElement>(
    dismiss,
    cancelButtonRef,
  );
  return (
    <div
      role="presentation"
      onClick={dismiss}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 2,
        background: "rgba(15, 23, 42, 0.24)",
        display: "grid",
        placeItems: "center",
        padding: 20,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="仕訳の削除確認"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 340,
          borderRadius: radii.md,
          border: `1px solid ${palette.borderStrong}`,
          background: palette.surface,
          boxShadow: shadows.popup,
          padding: 18,
        }}
      >
        <div
          style={{
            fontSize: fontSize.lg,
            fontWeight: fontWeight.bold,
            color: entryDrawerColors.text,
          }}
        >
          仕訳を削除しますか
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: fontSize.sm,
            lineHeight: 1.7,
            color: entryDrawerColors.soft,
          }}
        >
          この操作は取り消せません。
        </div>
        <div
          style={{
            marginTop: 18,
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={props.onCancel}
            disabled={props.deleting}
            style={{
              ...secondaryButtonStyle,
              opacity: props.deleting ? 0.5 : 1,
              cursor: props.deleting ? "default" : "pointer",
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={props.onConfirm}
            disabled={props.deleting}
            style={{
              ...deleteEntryButtonStyle,
              background: entryDrawerColors.red,
              color: palette.surface,
              opacity: props.deleting ? 0.5 : 1,
              cursor: props.deleting ? "default" : "pointer",
            }}
          >
            {props.deleting ? "削除中…" : "削除"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "6px 14px 4px",
        fontSize: fontSize.xs,
        fontWeight: fontWeight.bold,
        letterSpacing: "0.06em",
        color: entryDrawerColors.muted,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "12px 14px",
        fontSize: fontSize.sm,
        color: entryDrawerColors.muted,
        textAlign: "center",
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  );
}

const menuItemStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  padding: "8px 14px",
  fontSize: fontSize.base,
  color: entryDrawerColors.text,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const popupStyle: CSSProperties = {
  position: "absolute",
  top: 40,
  left: 0,
  right: 0,
  zIndex: 60,
  minWidth: 220,
  background: entryDrawerColors.bg,
  border: `1px solid ${entryDrawerColors.border}`,
  borderRadius: radii.md,
  boxShadow: shadows.popup,
  overflow: "hidden",
};

export const secondaryButtonStyle: CSSProperties = {
  height: sizes.button.formHeight,
  minWidth: sizes.button.formSecondaryMinWidth,
  padding: "0 16px",
  borderRadius: radii.sm,
  border: `1px solid ${entryDrawerColors.border}`,
  background: entryDrawerColors.bg,
  color: entryDrawerColors.text,
  ...typography.control,
  cursor: "pointer",
};

export const primaryButtonStyle: CSSProperties = {
  height: sizes.button.formHeight,
  minWidth: sizes.button.formPrimaryMinWidth,
  padding: "0 18px",
  borderRadius: radii.sm,
  border: "none",
  background: entryDrawerColors.blue,
  color: "#FFFFFF",
  ...typography.control,
  fontWeight: fontWeight.bold,
  boxShadow: shadows.primaryButton,
};

export const deleteEntryButtonStyle: CSSProperties = {
  height: sizes.button.formHeight,
  minWidth: sizes.button.formSecondaryMinWidth,
  padding: "0 16px",
  borderRadius: radii.sm,
  border: `1px solid ${palette.dangerBorder}`,
  background: palette.surface,
  color: entryDrawerColors.red,
  ...typography.control,
  fontWeight: fontWeight.bold,
};

export function ActionRowButton({
  variant,
  ariaLabel,
  label,
  enabled,
  onClick,
}: {
  variant: "add" | "delete";
  ariaLabel: string;
  label?: string;
  enabled: boolean;
  onClick: () => void;
}) {
  const baseColor = variant === "add" ? palette.success : entryDrawerColors.red;
  const color = enabled ? baseColor : entryDrawerColors.muted;
  const hasLabel = label != null && label !== "";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      aria-label={ariaLabel}
      title={ariaLabel}
      style={{
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: enabled ? "pointer" : "default",
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 999,
          border: `1.5px solid ${color}`,
          background: entryDrawerColors.bg,
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {variant === "add" ? <PlusIcon /> : <MinusIcon />}
      </span>
      {hasLabel ? (
        <span
          style={{
            fontSize: fontSize.base,
            fontWeight: fontWeight.semibold,
            color,
          }}
        >
          {label}
        </span>
      ) : null}
    </button>
  );
}

function CheckIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <polyline
        points="5 12 10 17 19 7"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <line
        x1="6"
        y1="6"
        x2="18"
        y2="18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <line
        x1="18"
        y1="6"
        x2="6"
        y2="18"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function WarnIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3l10 18H2L12 3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <line
        x1="12"
        y1="10"
        x2="12"
        y2="14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <line
        x1="12"
        y1="5"
        x2="12"
        y2="19"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="5"
        y1="12"
        x2="19"
        y2="12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <line
        x1="5"
        y1="12"
        x2="19"
        y2="12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
