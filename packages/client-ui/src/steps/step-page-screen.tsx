"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { fontSize, fontWeight, palette, sizes, typography } from "../shared/design-tokens";
import { normalizePathname } from "../shared/pathname";
import { ClosingBody } from "./bodies/closing";
import { DocumentReceiveBody } from "./bodies/document-receive";
import { FiscalPeriodSettingsBody } from "./bodies/fiscal-period-settings";
import { JournalizingBody } from "./bodies/journalizing";
import { NextFiscalPeriodBody } from "./bodies/next-fiscal-period";
import { OpeningBsBody } from "./bodies/opening-bs";
import type { StepItem } from "@rubydogjp/openkk-client-domain";
import { type StepTrendPoint } from "@rubydogjp/openkk-client-domain";
import { StatusChip } from "./step-ui";

export const STEP_PATHS: Record<number, string> = {
  1: "/steps/fiscal-period-settings",
  2: "/steps/opening-bs",
  3: "/steps/journalizing",
  4: "/steps/closing",
  5: "/steps/document-receive",
  6: "/steps/next-fiscal-period",
};

const URL_TO_STEP_NO: Record<string, number> = Object.fromEntries(
  Object.entries(STEP_PATHS).map(([no, path]) => [path, Number(no)]),
);

export function getStepNoForPathname(pathname: string): number | null {
  return URL_TO_STEP_NO[normalizePathname(pathname)] ?? null;
}

export function StepsPageScreen({
  items,
  trendPoints,
}: {
  items: StepItem[];
  trendPoints: StepTrendPoint[];
}) {
  const pathname = usePathname();
  const router = useRouter();

  const currentStepNumber = useMemo<number>(
    () => items.find((s) => s.status === "doing")?.no ?? items[items.length - 1]?.no ?? 1,
    [items],
  );
  const urlActiveStep = useMemo<number | null>(
    () => getStepNoForPathname(pathname),
    [pathname],
  );
  const activeStepNo = urlActiveStep ?? currentStepNumber;

  const previousCurrentStepRef = useRef<number | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const [bodyBusy, setBodyBusy] = useState(false);

  useEffect(() => {
    if (previousCurrentStepRef.current === currentStepNumber) return;
    const isFirstSync = previousCurrentStepRef.current === null;
    previousCurrentStepRef.current = currentStepNumber;
    if (isFirstSync) return;
    if (bodyBusy) return;
    if (urlActiveStep != null && urlActiveStep !== currentStepNumber) {
      const path = STEP_PATHS[currentStepNumber];
      if (path != null) router.replace(path, { scroll: false });
    }
  }, [currentStepNumber, bodyBusy, urlActiveStep, router]);

  useEffect(() => {
    if (urlActiveStep != null) return;
    const path = STEP_PATHS[currentStepNumber];
    if (path != null) router.replace(path, { scroll: false });
  }, [urlActiveStep, currentStepNumber, router]);

  useEffect(() => {
    let el: HTMLElement | null = mainRef.current?.parentElement ?? null;
    while (el != null) {
      if (el.scrollHeight > el.clientHeight) {
        el.scrollTop = 0;
        return;
      }
      el = el.parentElement;
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }, [activeStepNo]);

  const active = items.find((s) => s.no === activeStepNo) ?? items[0];

  function navigateToStep(no: number) {
    const path = STEP_PATHS[no];
    if (path == null) return;
    router.replace(path, { scroll: false });
  }

  if (active == null) return null;

  return (

    <main ref={mainRef} style={{ minHeight: "100%" }}>

      <StepperBar
        steps={items}
        activeNo={activeStepNo}
        onSelect={navigateToStep}
      />

      <div
        style={{

          maxWidth: sizes.content.readingMaxWidth,
          margin: "0 auto",
          padding: "24px 24px 96px",
        }}
      >

        <header style={{ marginBottom: 32 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",

              gap: 12,
              padding: "0 0 10px",
              borderBottom: `1px solid ${palette.hairline}`,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: typography.pageTitle.fontSize,
                fontWeight: fontWeight.bold,
                color: palette.text,
                letterSpacing: "-0.01em",
                lineHeight: 1.3,
              }}
            >
              {active.title}
            </h1>
            <StepTitleStatusChip status={active.status} />
          </div>
          <p
            style={{
              margin: "10px 0 0",
              fontSize: fontSize.md,
              color: palette.textSoft,
              lineHeight: 1.7,
            }}
          >
            {active.subtitle}
          </p>
        </header>

        <StepBody
          activeStepNo={active.no}
          onSwitchToStep={navigateToStep}
          onBusyChange={setBodyBusy}
          trendPoints={trendPoints}
        />
      </div>
    </main>
  );
}

function StepTitleStatusChip({
  status,
}: {
  status: StepItem["status"];
}) {
  if (status === "done") return <StatusChip label="完了" tone="success" />;
  if (status === "todo") return <StatusChip label="未着手" tone="muted" />;
  return null;
}

function StepBody({
  activeStepNo,
  onSwitchToStep,
  onBusyChange,
  trendPoints,
}: {
  activeStepNo: number;
  onSwitchToStep: (no: number) => void;
  onBusyChange: (busy: boolean) => void;
  trendPoints: StepTrendPoint[];
}) {
  switch (activeStepNo) {
    case 1:
      return <FiscalPeriodSettingsBody onSwitchToStep={onSwitchToStep} />;
    case 2:
      return <OpeningBsBody onSwitchToStep={onSwitchToStep} />;
    case 3:
      return (
        <JournalizingBody
          onSwitchToStep={onSwitchToStep}
          trendPoints={trendPoints}
        />
      );
    case 4:
      return <ClosingBody onSwitchToStep={onSwitchToStep} onBusyChange={onBusyChange} />;
    case 5:
      return <DocumentReceiveBody onSwitchToStep={onSwitchToStep} />;
    case 6:
      return <NextFiscalPeriodBody onSwitchToStep={onSwitchToStep} />;
    default:
      return null;
  }
}

export function StepperBar({
  steps,
  activeNo,
  onSelect,
}: {
  steps: StepItem[];
  activeNo: number;
  onSelect: (no: number) => void;
}) {
  return (
    <div
      className="bk-stepper-bar"
      style={{
        background: palette.surface,

        borderBottom: `1px solid ${palette.borderHeavy}`,

        padding: "16px 24px 19px",
      }}
    >
      <div
        style={{
          maxWidth: sizes.content.controlBarMaxWidth,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: 16,
        }}
      >

        <div
          style={{
            fontSize: typography.dialogTitle.fontSize,
            fontWeight: fontWeight.regular,
            color: palette.text,
            letterSpacing: "0.02em",
            lineHeight: "26px",
            minWidth: 0,
            whiteSpace: "nowrap",
          }}
        >
          手順 {activeNo}
        </div>

        <div className="bk-stepper-dots-full">
          {steps.map((s, i) => (
            <Fragment key={s.no}>
              <StepperDot
                step={s}
                active={s.no === activeNo}
                onClick={() => onSelect(s.no)}
              />
              {i < steps.length - 1 ? <StepperConnector /> : null}
            </Fragment>
          ))}
        </div>
        <div className="bk-stepper-dots-windowed">
          <WindowedStepperDots
            steps={steps}
            activeNo={activeNo}
            onSelect={onSelect}
          />
        </div>
      </div>
    </div>
  );
}

const DOT_GRAY = "#C8C8C8";
function StepperDot({
  step,
  active,
  onClick,
}: {
  step: StepItem;
  active: boolean;
  onClick: () => void;
}) {
  const isDoing = step.status === "doing";
  const isDone = step.status === "done";
  const bg = isDoing ? palette.text : DOT_GRAY;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={step.title}
      title={step.title}
      style={{
        position: "relative",
        width: 26,
        height: 26,
        borderRadius: 999,
        background: bg,
        color: palette.surface,
        display: "grid",
        placeItems: "center",
        fontSize: fontSize.sm,
        fontWeight: fontWeight.bold,
        border: "none",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      }}
    >
      {isDone ? <DotCheckIcon /> : step.no}

      {active ? (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "calc(100% + 16px)",
            left: "50%",
            transform: "translateX(-50%)",
            width: 26,
            height: 3,
            background: palette.text,
          }}
        />
      ) : null}
    </button>
  );
}

function DotCheckIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <polyline
        points="5 12 10 17 19 7"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StepperConnector() {
  return (
    <div
      className="bk-stepper-connector"
      style={{
        width: 24,
        height: 2,
        borderRadius: 999,
        background: DOT_GRAY,
        margin: "0 4px",
      }}
    />
  );
}

function WindowedStepperDots({
  steps,
  activeNo,
  onSelect,
}: {
  steps: StepItem[];
  activeNo: number;
  onSelect: (no: number) => void;
}) {
  const idx = steps.findIndex((s) => s.no === activeNo);
  if (idx < 0) return null;
  const prev = idx > 0 ? steps[idx - 1] : null;
  const current = steps[idx];
  const next = idx < steps.length - 1 ? steps[idx + 1] : null;

  const hasMorePrev = idx > 1;
  const hasMoreNext = idx < steps.length - 2;

  if (current == null) return null;

  return (
    <>
      {hasMorePrev ? <OverflowMarker /> : null}
      {prev != null ? (
        <StepperDot
          step={prev}
          active={false}
          onClick={() => onSelect(prev.no)}
        />
      ) : (

        <EmptySlot />
      )}
      {prev != null ? <StepperConnector /> : null}
      <StepperDot
        step={current}
        active
        onClick={() => onSelect(current.no)}
      />
      {next != null ? <StepperConnector /> : null}
      {next != null ? (
        <StepperDot
          step={next}
          active={false}
          onClick={() => onSelect(next.no)}
        />
      ) : (
        <EmptySlot />
      )}
      {hasMoreNext ? <OverflowMarker /> : null}
    </>
  );
}

function EmptySlot() {
  return <div style={{ width: 26, height: 26, flexShrink: 0 }} />;
}

function OverflowMarker() {
  return (
    <div
      style={{
        width: 16,
        height: 2,
        borderRadius: 999,
        background: DOT_GRAY,
        flexShrink: 0,
      }}
    />
  );
}

export type { ReactNode };
