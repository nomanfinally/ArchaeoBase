"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarRange, X } from "lucide-react";

export type TimeWindowValue = {
  startYear: number;
  endYear: number;
  intervals?: { startYear: number; endYear: number; label?: string }[];
};

type TimeMode = "calendar" | "bp";
type Era = "BCE" | "CE";
export type PeriodOption = {
  label: string;
  startYear: number;
  endYear: number;
};

const MIN_YEAR = -50000;
const MAX_YEAR = 2026;
const PRESENT_YEAR = 1950;
const STEP = 50;
export const periodStorageKey = "archaebase:time-periods";

export const defaultPeriodOptions: PeriodOption[] = [
  { label: "Paleolithic", startYear: MIN_YEAR, endYear: -10000 },
  { label: "Mesolithic", startYear: -10000, endYear: -8000 },
  { label: "Neolithic", startYear: -8000, endYear: -3300 },
  { label: "Bronze Age", startYear: -3300, endYear: -1200 },
  { label: "Iron Age", startYear: -1200, endYear: -500 },
  { label: "Classical", startYear: -800, endYear: 500 },
  { label: "Medieval", startYear: 500, endYear: 1500 },
  { label: "Modern", startYear: 1500, endYear: MAX_YEAR }
];

const ticks = [
  MIN_YEAR,
  -40000,
  -30000,
  -20000,
  -10000,
  -5000,
  MAX_YEAR
];

export const fullTimeWindow: TimeWindowValue = {
  startYear: MIN_YEAR,
  endYear: MAX_YEAR
};

export function isFullTimeWindow(value: TimeWindowValue) {
  return !value.intervals?.length && value.startYear <= MIN_YEAR && value.endYear >= MAX_YEAR;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function formatYear(year: number) {
  if (year >= MAX_YEAR) return "Modern";
  if (year === 0) return "1 BCE/CE";
  if (year < 0) return `${formatInteger(Math.abs(year))} BCE`;
  return `${formatInteger(year)} CE`;
}

function formatBp(year: number) {
  if (year >= MAX_YEAR) return "Modern";
  return `${formatInteger(Math.max(0, PRESENT_YEAR - year))} BP`;
}

function labelForMode(year: number, mode: TimeMode) {
  return mode === "bp" ? formatBp(year) : formatYear(year);
}

function tickLabelForMode(year: number, mode: TimeMode) {
  if (year >= MAX_YEAR) return "Modern";
  if (mode === "bp") return formatInteger(Math.max(0, PRESENT_YEAR - year));
  if (year < 0) return formatInteger(Math.abs(year));
  return formatInteger(year);
}

function clampStart(value: number, endYear: number) {
  return Math.min(endYear, Math.max(MIN_YEAR, value));
}

function clampEnd(value: number, startYear: number) {
  return Math.max(startYear, Math.min(MAX_YEAR, value));
}

function percentForYear(year: number) {
  return ((year - MIN_YEAR) / (MAX_YEAR - MIN_YEAR)) * 100;
}

function calendarParts(year: number): { value: number; era: Era } {
  if (year < 0) return { value: Math.abs(year), era: "BCE" };
  return { value: Math.min(year, MAX_YEAR), era: "CE" };
}

function calendarYearFromParts(value: number, era: Era) {
  const normalized = Math.max(0, Math.round(value));
  return era === "BCE" ? -normalized : normalized;
}

function bpFromYear(year: number) {
  return Math.max(0, Math.round(PRESENT_YEAR - Math.min(year, PRESENT_YEAR)));
}

function yearFromBp(bp: number) {
  return PRESENT_YEAR - Math.max(0, Math.round(bp));
}

function derivePeriodWindow(periods: PeriodOption[], fromLabel: string, toLabel: string): TimeWindowValue | null {
  const fromIndex = periods.findIndex((period) => period.label === fromLabel);
  const toIndex = periods.findIndex((period) => period.label === toLabel);
  if (fromIndex < 0 || toIndex < 0) return null;

  const first = periods[Math.min(fromIndex, toIndex)];
  const last = periods[Math.max(fromIndex, toIndex)];
  return { startYear: first.startYear, endYear: last.endYear };
}

function periodWindowForLabels(periods: PeriodOption[], labels: Set<string>) {
  const selectedPeriods = periods.filter((period) => labels.has(period.label));
  if (!selectedPeriods.length) return fullTimeWindow;
  return {
    startYear: Math.min(...selectedPeriods.map((period) => period.startYear)),
    endYear: Math.max(...selectedPeriods.map((period) => period.endYear)),
    intervals: selectedPeriods.map((period) => ({ startYear: period.startYear, endYear: period.endYear, label: period.label }))
  };
}

function selectedPeriodLabels(periods: PeriodOption[], value: TimeWindowValue) {
  if (value.intervals?.length) {
    return periods
      .filter((period) => value.intervals?.some((interval) => interval.startYear === period.startYear && interval.endYear === period.endYear))
      .map((period) => period.label);
  }

  return periods
    .filter((period) => value.startYear === period.startYear && value.endYear === period.endYear)
    .map((period) => period.label);
}

export function validStoredPeriods(value: unknown): PeriodOption[] | null {
  if (!Array.isArray(value)) return null;
  const next = defaultPeriodOptions.map((defaultPeriod) => {
    const stored = value.find((item) => item?.label === defaultPeriod.label);
    if (!stored || typeof stored.startYear !== "number" || typeof stored.endYear !== "number") return defaultPeriod;
    return {
      ...defaultPeriod,
      startYear: clampStart(stored.startYear, MAX_YEAR),
      endYear: clampEnd(stored.endYear, MIN_YEAR)
    };
  });
  return next.map((period) => (
    period.startYear <= period.endYear
      ? period
      : { ...period, startYear: period.endYear, endYear: period.startYear }
  ));
}

type Props = {
  value: TimeWindowValue;
  onChange: (value: TimeWindowValue) => void;
  periodOptions: PeriodOption[];
};

type TimePeriodSettingsProps = {
  periodOptions: PeriodOption[];
  onChange: (periodOptions: PeriodOption[]) => void;
};

export function TimePeriodSettings({ periodOptions, onChange }: TimePeriodSettingsProps) {
  const [settingsMode, setSettingsMode] = useState<TimeMode>("calendar");

  function updatePeriodBoundary(label: string, edge: "startYear" | "endYear", nextYear: number) {
    onChange(periodOptions.map((period) => {
      if (period.label !== label) return period;
      if (edge === "startYear") return { ...period, startYear: clampStart(nextYear, period.endYear) };
      return { ...period, endYear: clampEnd(nextYear, period.startYear) };
    }));
  }

  function renderPeriodBoundaryInput(period: PeriodOption, edge: "startYear" | "endYear") {
    const year = period[edge];
    if (settingsMode === "bp") {
      return (
        <input
          className="input period-boundary-input"
          type="number"
          min={0}
          max={PRESENT_YEAR - MIN_YEAR}
          value={bpFromYear(year)}
          onChange={(event) => updatePeriodBoundary(period.label, edge, yearFromBp(Number(event.target.value)))}
        />
      );
    }

    const parts = calendarParts(year);
    return (
      <div className="period-boundary-calendar">
        <input
          className="input period-boundary-input"
          type="number"
          min={0}
          max={50000}
          value={parts.value}
          onChange={(event) => updatePeriodBoundary(period.label, edge, calendarYearFromParts(Number(event.target.value), parts.era))}
        />
        <select
          className="select period-boundary-era"
          value={parts.era}
          onChange={(event) => updatePeriodBoundary(period.label, edge, calendarYearFromParts(parts.value, event.target.value as Era))}
        >
          <option value="BCE">BCE</option>
          <option value="CE">CE</option>
        </select>
      </div>
    );
  }

  return (
    <div className="period-settings-panel main-settings-periods">
      <div className="period-settings-toolbar">
        <div className="mini-segmented" aria-label="Period boundary mode">
          <button type="button" className={settingsMode === "calendar" ? "active" : ""} onClick={() => setSettingsMode("calendar")}>
            BCE/CE
          </button>
          <button type="button" className={settingsMode === "bp" ? "active" : ""} onClick={() => setSettingsMode("bp")}>
            BP
          </button>
        </div>
        <button className="button period-reset-button" type="button" onClick={() => onChange(defaultPeriodOptions)}>
          Reset periods
        </button>
      </div>
      <div className="period-settings-header">
        <span>Period</span>
        <span>Start</span>
        <span>End</span>
      </div>
      <div className="period-settings-rows">
        {periodOptions.map((period) => (
          <div className="period-settings-row" key={period.label}>
            <strong>{period.label}</strong>
            {renderPeriodBoundaryInput(period, "startYear")}
            {renderPeriodBoundaryInput(period, "endYear")}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TimeWindow({ value, onChange, periodOptions }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<TimeMode>("calendar");
  const [lastPeriodClick, setLastPeriodClick] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const label = useMemo(() => `${labelForMode(value.startYear, mode)} — ${labelForMode(value.endYear, mode)}`, [value, mode]);
  const startPercent = percentForYear(value.startYear);
  const endPercent = percentForYear(value.endYear);
  const startCalendar = calendarParts(value.startYear);
  const endCalendar = calendarParts(value.endYear);
  const selectedStartPeriod = periodOptions.find((period) => period.startYear === value.startYear)?.label ?? "";
  const selectedEndPeriod = periodOptions.find((period) => period.endYear === value.endYear)?.label ?? "";
  const presets = useMemo(() => [{ label: "Full", startYear: MIN_YEAR, endYear: MAX_YEAR }, ...periodOptions], [periodOptions]);
  const checkedPeriods = useMemo(() => new Set(selectedPeriodLabels(periodOptions, value)), [periodOptions, value]);
  const displayIntervals = value.intervals?.length ? value.intervals : [{ startYear: value.startYear, endYear: value.endYear }];

  function setStartYear(nextYear: number) {
    onChange({ startYear: clampStart(nextYear, value.endYear), endYear: value.endYear });
  }

  function setEndYear(nextYear: number) {
    onChange({ startYear: value.startYear, endYear: clampEnd(nextYear, value.startYear) });
  }

  function setPeriodRange(nextStartLabel: string, nextEndLabel: string) {
    const nextWindow = derivePeriodWindow(periodOptions, nextStartLabel, nextEndLabel);
    if (!nextWindow) return;

    const fromIndex = periodOptions.findIndex((period) => period.label === nextStartLabel);
    const toIndex = periodOptions.findIndex((period) => period.label === nextEndLabel);
    const selectedPeriods = periodOptions.slice(Math.min(fromIndex, toIndex), Math.max(fromIndex, toIndex) + 1);
    onChange({
      ...nextWindow,
      intervals: selectedPeriods.map((period) => ({ startYear: period.startYear, endYear: period.endYear, label: period.label }))
    });
  }

  function togglePeriod(label: string, shiftKey: boolean) {
    const nextLabels = new Set(checkedPeriods);
    const clickedIndex = periodOptions.findIndex((period) => period.label === label);
    const lastIndex = lastPeriodClick ? periodOptions.findIndex((period) => period.label === lastPeriodClick) : -1;

    if (shiftKey && clickedIndex >= 0 && lastIndex >= 0) {
      nextLabels.clear();
      const startIndex = Math.min(clickedIndex, lastIndex);
      const endIndex = Math.max(clickedIndex, lastIndex);
      periodOptions.slice(startIndex, endIndex + 1).forEach((period) => nextLabels.add(period.label));
    } else if (nextLabels.has(label)) {
      nextLabels.delete(label);
    } else {
      nextLabels.add(label);
    }

    setLastPeriodClick(label);
    onChange(periodWindowForLabels(periodOptions, nextLabels));
  }

  return (
    <div className="time-window" ref={popoverRef}>
      <button className={`button time-window-button ${open ? "active" : ""}`} type="button" onClick={() => setOpen((current) => !current)}>
        <CalendarRange size={15} />
        <span>{label}</span>
      </button>

      {open ? (
        <div className="time-window-popover">
          <div className="time-window-header">
            <strong>Time Window</strong>
            <div className="time-window-header-actions">
              <div className="mini-segmented" aria-label="Time input mode">
                <button type="button" className={mode === "calendar" ? "active" : ""} onClick={() => setMode("calendar")}>
                  BCE/CE
                </button>
                <button type="button" className={mode === "bp" ? "active" : ""} onClick={() => setMode("bp")}>
                  BP
                </button>
              </div>
              <button className="icon-button" type="button" onClick={() => setOpen(false)} aria-label="Close time window">
                <X size={15} />
              </button>
            </div>
          </div>

          <div className="time-window-inputs">
            {mode === "calendar" ? (
              <>
                <label className="time-field">
                  <span>Start</span>
                  <div className="year-input-group">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={50000}
                      value={startCalendar.value}
                      onChange={(event) => setStartYear(calendarYearFromParts(Number(event.target.value), startCalendar.era))}
                    />
                    <select
                      className="select"
                      value={startCalendar.era}
                      onChange={(event) => setStartYear(calendarYearFromParts(startCalendar.value, event.target.value as Era))}
                    >
                      <option value="BCE">BCE</option>
                      <option value="CE">CE</option>
                    </select>
                  </div>
                </label>
                <label className="time-field">
                  <span>End</span>
                  <div className="year-input-group">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={MAX_YEAR}
                      value={endCalendar.value}
                      onChange={(event) => setEndYear(calendarYearFromParts(Number(event.target.value), endCalendar.era))}
                    />
                    <select
                      className="select"
                      value={endCalendar.era}
                      onChange={(event) => setEndYear(calendarYearFromParts(endCalendar.value, event.target.value as Era))}
                    >
                      <option value="BCE">BCE</option>
                      <option value="CE">CE</option>
                    </select>
                  </div>
                </label>
              </>
            ) : (
              <>
                <label className="time-field">
                  <span>Start BP</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={PRESENT_YEAR - MIN_YEAR}
                    value={bpFromYear(value.startYear)}
                    onChange={(event) => setStartYear(yearFromBp(Number(event.target.value)))}
                  />
                </label>
                <label className="time-field">
                  <span>End BP</span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={PRESENT_YEAR - MIN_YEAR}
                    value={bpFromYear(value.endYear)}
                    onChange={(event) => setEndYear(yearFromBp(Number(event.target.value)))}
                  />
                </label>
              </>
            )}
          </div>

          <div className="period-range-picker">
            <span className="period-range-title">Period Range</span>
            <div className="period-range-controls">
              <label>
                <span>From</span>
                <select
                  className="select"
                  value={selectedStartPeriod}
                  onChange={(event) => {
                    const nextStart = event.target.value;
                    if (!nextStart) return;
                    setPeriodRange(nextStart, selectedEndPeriod || nextStart);
                  }}
                >
                  <option value="">Custom</option>
                  {periodOptions.map((period) => (
                    <option key={period.label} value={period.label}>
                      {period.label}
                    </option>
                  ))}
                </select>
              </label>
              <ArrowRight className="period-range-arrow" size={17} aria-hidden="true" />
              <label>
                <span>To</span>
                <select
                  className="select"
                  value={selectedEndPeriod}
                  onChange={(event) => {
                    const nextEnd = event.target.value;
                    if (!nextEnd) return;
                    setPeriodRange(selectedStartPeriod || nextEnd, nextEnd);
                  }}
                >
                  <option value="">Custom</option>
                  {periodOptions.map((period) => (
                    <option key={period.label} value={period.label}>
                      {period.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="range-panel">
            <div className="time-window-readout">
              <span>{labelForMode(value.startYear, mode)}</span>
              <span>{labelForMode(value.endYear, mode)}</span>
            </div>

            <div className="range-shell">
              <div className="range-track" />
              {displayIntervals.map((interval, index) => (
                <div
                  className="range-fill"
                  key={`${interval.startYear}-${interval.endYear}-${interval.label ?? index}`}
                  style={{ left: `${percentForYear(interval.startYear)}%`, right: `${100 - percentForYear(interval.endYear)}%` }}
                />
              ))}
              <div className="range-handle-marker" style={{ left: `${startPercent}%` }} />
              <div className="range-handle-marker" style={{ left: `${endPercent}%` }} />
              <div className="range-ticks" aria-hidden="true">
                {ticks.map((tick) => (
                  <span key={tick} style={{ left: `${percentForYear(tick)}%` }}>
                    <i />
                    <em>{tickLabelForMode(tick, mode)}</em>
                  </span>
                ))}
              </div>
              <input
                className="range-input range-start"
                aria-label="Start year"
                type="range"
                min={MIN_YEAR}
                max={MAX_YEAR}
                step={STEP}
                value={value.startYear}
                onChange={(event) => setStartYear(Number(event.target.value))}
              />
              <input
                className="range-input range-end"
                aria-label="End year"
                type="range"
                min={MIN_YEAR}
                max={MAX_YEAR}
                step={STEP}
                value={value.endYear}
                onChange={(event) => setEndYear(Number(event.target.value))}
              />
            </div>

            <div className="time-window-bounds">
              <span>{labelForMode(MIN_YEAR, mode)}</span>
              <span>{labelForMode(MAX_YEAR, mode)}</span>
            </div>
          </div>

          <div className="period-presets">
            {presets.map((preset) => (
              <button
                key={preset.label}
                className={preset.label === "Full"
                  ? value.startYear === preset.startYear && value.endYear === preset.endYear ? "active" : ""
                  : checkedPeriods.has(preset.label) ? "active" : ""}
                type="button"
                title={preset.label === "Full" ? undefined : "Shift-click to select a continuous period range"}
                onClick={(event) => {
                  if (preset.label === "Full") {
                    setLastPeriodClick(null);
                    onChange({ startYear: preset.startYear, endYear: preset.endYear });
                    return;
                  }
                  togglePeriod(preset.label, event.shiftKey);
                }}
              >
                <span className="period-check" aria-hidden="true" />
                <span className="period-label">{preset.label}</span>
              </button>
            ))}
          </div>

        </div>
      ) : null}
    </div>
  );
}
