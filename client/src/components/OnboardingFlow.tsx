/* ==========================================================
   THE AXIOM - Onboarding Flow
  Progressive, step-by-step onboarding with scroll-box time
   inputs and typed submission output.
   ========================================================== */

"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { registerUser } from "@/app/actions/auth";

type RoleIndex = 0 | 1 | 2 | 3 | 4;
type SessionStyleIndex = 0 | 1 | 2 | 3;
type SwitchBufferIndex = 0 | 1 | 2 | 3;
type DeadlineStyleIndex = 0 | 1 | 2;

type FixedBlock = {
  title: string;
  start_min: number;
  end_min: number;
  days: number[];
  recurring: boolean;
};

type TimeExclusion = {
  label: string;
  start_min: number;
  end_min: number;
  days: number[];
};

type TimeWindow = {
  start_min: number;
  end_min: number;
};

type RecreationalTask = {
  name: string;
  duration_min: number;
  energy_value: number;
};

interface OnboardingSubmission {
  timezone: string;
  role: RoleIndex;
  fixed_commitments: FixedBlock[];
  hard_exclusions: TimeExclusion[];
  wake_sleep: { wake: number; sleep: number };
  peak_focus_windows: TimeWindow[];
  low_energy_windows: TimeWindow[];
  session_config: {
    session_style: SessionStyleIndex;
    switch_buffer: SwitchBufferIndex;
  };
  deadline_style: DeadlineStyleIndex;
  recovery_activities: RecreationalTask[];
}

type AnchorBlockDraft = {
  id: string;
  name: string;
  start_min: number;
  end_min: number;
  days: number[];
};

type TimeWindowDraft = {
  id: string;
  start_min: number;
  end_min: number;
};

type RecreationalTaskDraft = {
  id: string;
  name: string;
  duration_min: number;
  energy_value: number;
};

type Step = 0 | 1 | 2 | 3 | 4;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const ROLE_OPTIONS: { label: string; value: RoleIndex }[] = [
  { label: "Student", value: 0 },
  { label: "Researcher", value: 1 },
  { label: "Professional", value: 2 },
  { label: "Self-learner", value: 3 },
  { label: "Other", value: 4 },
];

const SESSION_STYLE_OPTIONS: { label: string; value: SessionStyleIndex }[] = [
  { label: "Long deep blocks (90+ min)", value: 0 },
  { label: "Medium sprints (45-60 min)", value: 1 },
  { label: "Short bursts (20-30 min)", value: 2 },
  { label: "Mix it up", value: 3 },
];

const SWITCH_BUFFER_OPTIONS: { label: string; value: SwitchBufferIndex }[] = [
  { label: "Jump right in (0-5 min)", value: 0 },
  { label: "Quick shift (10-15 min)", value: 1 },
  { label: "Proper break (20-30 min)", value: 2 },
  { label: "Finish one first", value: 3 },
];

const DEADLINE_STYLE_OPTIONS: { label: string; value: DeadlineStyleIndex }[] = [
  { label: "Finish early", value: 0 },
  { label: "Work steadily", value: 1 },
  { label: "Work under pressure", value: 2 },
];

const DEFAULT_RECOVERY: RecreationalTaskDraft = {
  id: "recovery-1",
  name: "Walk",
  duration_min: 20,
  energy_value: 2.0,
};

type IntlWithSupportedValues = typeof Intl & {
  supportedValuesOf?: (key: "timeZone") => string[];
};

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`;
}

function formatMinutes(value: number): string {
  const normalized = ((Math.floor(value) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60)
    .toString()
    .padStart(2, "0");
  const m = (normalized % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function parseTimeInput(value: string): number | null {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length !== 4) return null;
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));

  // Normalize overflow minutes (e.g. 13:65 -> 14:05) before clamping.
  const normalizedTotal = hours * 60 + minutes;
  return clamp(normalizedTotal, 0, 1439);
}

function formatDraftTimeDigits(digits: string): string {
  const cleaned = digits.replace(/\D/g, "").slice(0, 4);
  if (cleaned.length === 0) return "";
  if (cleaned.length <= 2) {
    return `${cleaned}${cleaned.length === 2 ? ":" : ""}`;
  }
  return `${cleaned.slice(0, 2)}:${cleaned.slice(2)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToFive(value: number): number {
  return Math.round(value / 5) * 5;
}

function wrapToDay(value: number): number {
  const normalized = ((value % 1440) + 1440) % 1440;
  return normalized;
}

function normalizeSteppedMinutes(value: number): number {
  return wrapToDay(roundToFive(value));
}

function normalizeDuration(value: number): number {
  return roundToFive(clamp(Math.round(value), 5, 180));
}

function normalizeEnergy(value: number): number {
  return Number(clamp(value, 0.5, 3).toFixed(1));
}

function toggleDay(days: number[], dayIndex: number): number[] {
  if (days.includes(dayIndex)) return days.filter((d) => d !== dayIndex);
  return [...days, dayIndex].sort((a, b) => a - b);
}

function windowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  return a.start_min < b.end_min && a.end_min > b.start_min;
}

function validateRange(startMin: number, endMin: number): string[] {
  const errors: string[] = [];
  if (endMin <= startMin) errors.push("End time must be after start time.");
  return errors;
}

type TimeRangeSliderProps = {
  idPrefix: string;
  startMin: number;
  endMin: number;
  onChangeStart: (value: number) => void;
  onChangeEnd: (value: number) => void;
  startLabel?: string;
  endLabel?: string;
};

type TimeValueBoxProps = {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
};

function TimeValueBox({ id, label, value, onChange }: TimeValueBoxProps) {
  const safeValue = normalizeSteppedMinutes(value);
  const [isEditing, setIsEditing] = useState(false);
  const [draftDigits, setDraftDigits] = useState(
    formatMinutes(safeValue).replace(":", ""),
  );
  const inputRef = useRef<HTMLInputElement | null>(null);

  function bump(delta: number) {
    onChange(normalizeSteppedMinutes(safeValue + delta));
  }

  function commitDraft() {
    const parsed = parseTimeInput(draftDigits);
    if (parsed === null) {
      setDraftDigits(formatMinutes(safeValue).replace(":", ""));
      setIsEditing(false);
      return;
    }
    onChange(normalizeSteppedMinutes(parsed));
    setIsEditing(false);
  }

  function cancelDraft() {
    setDraftDigits(formatMinutes(safeValue).replace(":", ""));
    setIsEditing(false);
  }

  useEffect(() => {
    if (!isEditing) {
      setDraftDigits(formatMinutes(safeValue).replace(":", ""));
    }
  }, [isEditing, safeValue]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  return (
    <div style={{ display: "grid", justifyItems: "center", gap: 6 }}>
      <p className="meta-text">{label}</p>
      {isEditing ? (
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          value={formatDraftTimeDigits(draftDigits)}
          onChange={(event) => {
            const nextDigits = event.target.value
              .replace(/\D/g, "")
              .slice(0, 4);
            setDraftDigits(nextDigits);
          }}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              cancelDraft();
            }
          }}
          placeholder="HH:mm"
          style={{
            width: 112,
            height: 56,
            border: "1px solid var(--ink)",
            textAlign: "center",
            fontSize: 20,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.04em",
            background: "var(--card-bg)",
          }}
        />
      ) : (
        <div
          id={id}
          role="spinbutton"
          tabIndex={0}
          aria-label={`${label} time`}
          aria-valuemin={0}
          aria-valuemax={1435}
          aria-valuenow={safeValue}
          aria-valuetext={formatMinutes(safeValue)}
          onWheel={(event) => {
            event.preventDefault();
            event.currentTarget.focus();
            const delta = event.deltaY < 0 ? 5 : -5;
            bump(delta);
          }}
          onMouseDown={(event) => {
            event.currentTarget.focus();
          }}
          onDoubleClick={() => {
            setIsEditing(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "+") {
              event.preventDefault();
              bump(5);
              return;
            }
            if (event.key === "ArrowDown" || event.key === "-") {
              event.preventDefault();
              bump(-5);
              return;
            }
            if (event.key === "PageUp") {
              event.preventDefault();
              bump(30);
              return;
            }
            if (event.key === "PageDown") {
              event.preventDefault();
              bump(-30);
              return;
            }
            if (event.key === "Home") {
              event.preventDefault();
              onChange(0);
              return;
            }
            if (event.key === "End") {
              event.preventDefault();
              onChange(1435);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              setIsEditing(true);
            }
          }}
          style={{
            width: 112,
            height: 56,
            border: "1px solid var(--ink)",
            display: "grid",
            placeItems: "center",
            fontSize: 20,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "0.04em",
            userSelect: "none",
            cursor: "ns-resize",
            background: "var(--card-bg)",
          }}
        >
          {formatMinutes(safeValue)}
        </div>
      )}
      <span className="meta-text">Scroll, keys, or double-click to type</span>
    </div>
  );
}

function TimeRangeSlider({
  idPrefix,
  startMin,
  endMin,
  onChangeStart,
  onChangeEnd,
  startLabel = "Start",
  endLabel = "End",
}: TimeRangeSliderProps) {
  const safeStart = normalizeSteppedMinutes(startMin);
  const safeEnd = normalizeSteppedMinutes(endMin);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <TimeValueBox
          id={`${idPrefix}-start`}
          label={startLabel}
          value={safeStart}
          onChange={onChangeStart}
        />
        <TimeValueBox
          id={`${idPrefix}-end`}
          label={endLabel}
          value={safeEnd}
          onChange={onChangeEnd}
        />
      </div>
    </div>
  );
}

export default function OnboardingFlow() {
  const router = useRouter();

  const timezoneOptions = useMemo(() => {
    const intlApi = Intl as IntlWithSupportedValues;
    if (typeof intlApi.supportedValuesOf === "function") {
      return intlApi.supportedValuesOf("timeZone");
    }
    return [
      "UTC",
      "Asia/Kolkata",
      "Europe/London",
      "America/New_York",
      "America/Los_Angeles",
      "Asia/Tokyo",
      "Australia/Sydney",
    ];
  }, []);

  const detectedTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  const [step, setStep] = useState<Step>(0);

  const [accountName, setAccountName] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");

  const [timezone, setTimezone] = useState(
    timezoneOptions.includes(detectedTimezone)
      ? detectedTimezone
      : timezoneOptions[0],
  );
  const [role, setRole] = useState<RoleIndex | null>(null);

  const [wakeMin, setWakeMin] = useState(420);
  const [sleepMin, setSleepMin] = useState(1380);

  const [anchorBlocks, setAnchorBlocks] = useState<AnchorBlockDraft[]>([]);

  const [peakFocusWindows, setPeakFocusWindows] = useState<TimeWindowDraft[]>(
    [],
  );
  const [lowEnergyWindows, setLowEnergyWindows] = useState<TimeWindowDraft[]>(
    [],
  );

  const [sessionStyle, setSessionStyle] = useState<SessionStyleIndex>(1);
  const [switchBuffer, setSwitchBuffer] = useState<SwitchBufferIndex>(1);
  const [deadlineStyle, setDeadlineStyle] = useState<DeadlineStyleIndex>(1);

  const [recoveryActivity, setRecoveryActivity] =
    useState<RecreationalTaskDraft>(DEFAULT_RECOVERY);

  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const accountNameError =
    accountName.trim().length >= 2
      ? ""
      : "Please enter your name (at least 2 characters).";
  const accountEmailError = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)
    ? ""
    : "Please enter a valid email address.";
  const accountPasswordError =
    accountPassword.length >= 8
      ? ""
      : "Password must be at least 8 characters.";

  const timezoneError = timezoneOptions.includes(timezone)
    ? ""
    : "Choose a valid IANA timezone from the list.";
  const roleError = role === null ? "Select one primary role." : "";

  const wakeSleepError =
    sleepMin === wakeMin ? "Wake time must be after sleep time." : "";

  const wakeSleepWarning = useMemo(() => {
    if (wakeSleepError) return "";
    const sleepSpan =
      wakeMin > sleepMin ? wakeMin - sleepMin : 1440 - sleepMin + wakeMin;
    if (sleepSpan < 240 || sleepSpan > 720) {
      return "Warning: sleep duration is outside the typical 4-12 hour range.";
    }
    return "";
  }, [wakeMin, sleepMin, wakeSleepError]);

  const anchorErrors = useMemo(
    () =>
      anchorBlocks.map((item) => {
        const errors: string[] = [];
        if (!item.name.trim()) errors.push("Name is required.");
        errors.push(...validateRange(item.start_min, item.end_min));
        if (item.days.length === 0) errors.push("Pick at least one day.");
        return errors;
      }),
    [anchorBlocks],
  );

  const peakErrors = useMemo(() => {
    const errors = peakFocusWindows.map((item) =>
      validateRange(item.start_min, item.end_min),
    );
    for (let i = 0; i < peakFocusWindows.length; i += 1) {
      for (let j = i + 1; j < peakFocusWindows.length; j += 1) {
        if (windowsOverlap(peakFocusWindows[i], peakFocusWindows[j])) {
          errors[i].push("Peak windows cannot overlap.");
          errors[j].push("Peak windows cannot overlap.");
        }
      }
    }
    return errors;
  }, [peakFocusWindows]);

  const lowErrors = useMemo(() => {
    const errors = lowEnergyWindows.map((item) =>
      validateRange(item.start_min, item.end_min),
    );
    for (let i = 0; i < lowEnergyWindows.length; i += 1) {
      for (let j = i + 1; j < lowEnergyWindows.length; j += 1) {
        if (windowsOverlap(lowEnergyWindows[i], lowEnergyWindows[j])) {
          errors[i].push("Low-energy windows cannot overlap.");
          errors[j].push("Low-energy windows cannot overlap.");
        }
      }
    }
    return errors;
  }, [lowEnergyWindows]);

  const crossWindowWarning = useMemo(() => {
    for (const peak of peakFocusWindows) {
      for (const low of lowEnergyWindows) {
        if (windowsOverlap(peak, low)) {
          return "Note: one low-energy window overlaps a peak-focus window.";
        }
      }
    }
    return "";
  }, [peakFocusWindows, lowEnergyWindows]);

  const recoveryError = useMemo(() => {
    const errors: string[] = [];
    if (!recoveryActivity.name.trim())
      errors.push("Activity name is required.");
    if (
      !Number.isInteger(recoveryActivity.duration_min) ||
      recoveryActivity.duration_min < 5 ||
      recoveryActivity.duration_min > 180
    ) {
      errors.push("Duration must be an integer between 5 and 180.");
    }
    const energy = Number(recoveryActivity.energy_value.toFixed(1));
    if (energy < 0.5 || energy > 3) {
      errors.push("Energy value must be between 0.5 and 3.0.");
    }
    return errors[0] ?? "";
  }, [recoveryActivity]);

  const stepHasErrors = useMemo(() => {
    if (step === 0)
      return Boolean(
        accountNameError || accountEmailError || accountPasswordError,
      );
    if (step === 1)
      return Boolean(timezoneError || roleError || wakeSleepError);
    if (step === 2) {
      return anchorErrors.reduce((sum, e) => sum + e.length, 0) > 0;
    }
    if (step === 3) {
      const peakCount = peakErrors.reduce((sum, e) => sum + e.length, 0);
      const lowCount = lowErrors.reduce((sum, e) => sum + e.length, 0);
      const limitError =
        peakFocusWindows.length > 2 || lowEnergyWindows.length > 2;
      return peakCount + lowCount > 0 || limitError;
    }
    if (step === 4) {
      return Boolean(recoveryError);
    }
    return false;
  }, [
    step,
    accountNameError,
    accountEmailError,
    accountPasswordError,
    timezoneError,
    roleError,
    wakeSleepError,
    anchorErrors,
    peakErrors,
    lowErrors,
    peakFocusWindows.length,
    lowEnergyWindows.length,
    recoveryError,
  ]);

  const canAddAnchor =
    anchorBlocks.length === 0 ||
    anchorErrors[anchorBlocks.length - 1].length === 0;
  const canAddPeak =
    peakFocusWindows.length < 2 &&
    (peakFocusWindows.length === 0 ||
      peakErrors[peakFocusWindows.length - 1].length === 0);
  const canAddLow =
    lowEnergyWindows.length < 2 &&
    (lowEnergyWindows.length === 0 ||
      lowErrors[lowEnergyWindows.length - 1].length === 0);
  function addAnchorBlock() {
    if (!canAddAnchor) return;
    setAnchorBlocks((prev) => [
      ...prev,
      {
        id: createId("anchor"),
        name: "",
        start_min: 540,
        end_min: 600,
        days: [1, 2, 3, 4, 5],
      },
    ]);
  }

  function addPeakWindow() {
    if (!canAddPeak) return;
    setPeakFocusWindows((prev) => [
      ...prev,
      {
        id: createId("peak"),
        start_min: 540,
        end_min: 660,
      },
    ]);
  }

  function addLowWindow() {
    if (!canAddLow) return;
    setLowEnergyWindows((prev) => [
      ...prev,
      {
        id: createId("low"),
        start_min: 840,
        end_min: 900,
      },
    ]);
  }

  function goNext() {
    if (stepHasErrors) return;
    setStep((prev) => (prev < 4 ? ((prev + 1) as Step) : prev));
  }

  function goBack() {
    setStep((prev) => (prev > 0 ? ((prev - 1) as Step) : prev));
  }

  function buildSubmission(): OnboardingSubmission | null {
    if (stepHasErrors) return null;
    if (role === null) return null;

    return {
      timezone,
      role,
      fixed_commitments: anchorBlocks.map((item) => ({
        title: item.name.trim(),
        start_min: item.start_min,
        end_min: item.end_min,
        days: [...item.days].sort((a, b) => a - b),
        recurring: true,
      })),
      hard_exclusions: anchorBlocks.map((item) => ({
        label: item.name.trim(),
        start_min: item.start_min,
        end_min: item.end_min,
        days: [...item.days].sort((a, b) => a - b),
      })),
      wake_sleep: { wake: wakeMin, sleep: sleepMin },
      peak_focus_windows: peakFocusWindows.map((item) => ({
        start_min: item.start_min,
        end_min: item.end_min,
      })),
      low_energy_windows: lowEnergyWindows.map((item) => ({
        start_min: item.start_min,
        end_min: item.end_min,
      })),
      session_config: {
        session_style: sessionStyle,
        switch_buffer: switchBuffer,
      },
      deadline_style: deadlineStyle,
      recovery_activities: [
        {
          name: recoveryActivity.name.trim(),
          duration_min: normalizeDuration(recoveryActivity.duration_min),
          energy_value: normalizeEnergy(recoveryActivity.energy_value),
        },
      ],
    };
  }

  async function submitOnboarding() {
    setSubmitError("");
    const payload = buildSubmission();
    if (!payload) return;

    setIsSubmitting(true);
    const result = await registerUser({
      name: accountName,
      email: accountEmail,
      password: accountPassword,
      ...payload,
    });
    setIsSubmitting(false);

    if (result?.error) {
      setSubmitError(result.error);
      return;
    }

    router.push("/dashboard");
  }

  return (
    <div
      style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}
    >
      <header className="nav">
        <div className="nav-inner">
          <a href="/" className="logo">
            Axiom
          </a>
          <span className="meta-text">Onboarding Step {step + 1} of 5</span>
        </div>
      </header>
      <div style={{ height: 60 }} />

      <main
        className="container"
        style={{ flex: 1, paddingTop: 40, paddingBottom: 72 }}
      >
        <div style={{ display: "flex", gap: 6, marginBottom: 28 }}>
          {Array.from({ length: 5 }, (_, i) => (
            <div
              key={String(i)}
              style={{
                width: i === step ? 80 : 30,
                height: 4,
                background: i <= step ? "var(--ink)" : "var(--rule)",
                transition: "width 150ms ease",
              }}
            />
          ))}
        </div>

        {step === 0 && (
          <section style={{ maxWidth: 620 }}>
            <div className="meta-text" style={{ marginBottom: 10 }}>
              Account Setup
            </div>
            <h1 style={{ fontSize: 40, marginBottom: 14 }}>
              First, create your account
            </h1>
            <p style={{ color: "var(--muted)", marginBottom: 22 }}>
              Quick details first, then we will ask onboarding questions in
              short steps.
            </p>

            <div
              style={{
                borderTop: "0.5px solid var(--rule)",
                paddingTop: 16,
                display: "grid",
                gap: 14,
              }}
            >
              <div>
                <label htmlFor="acc-name">Name</label>
                <input
                  id="acc-name"
                  value={accountName}
                  onChange={(event) => setAccountName(event.target.value)}
                  placeholder="Your full name"
                />
                {accountNameError && accountName.length > 0 && (
                  <p style={{ color: "var(--warning)", marginTop: 6 }}>
                    {accountNameError}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="acc-email">Email</label>
                <input
                  id="acc-email"
                  type="email"
                  value={accountEmail}
                  onChange={(event) => setAccountEmail(event.target.value)}
                  placeholder="you@example.com"
                />
                {accountEmailError && accountEmail.length > 0 && (
                  <p style={{ color: "var(--warning)", marginTop: 6 }}>
                    {accountEmailError}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="acc-password">Password</label>
                <input
                  id="acc-password"
                  type="password"
                  value={accountPassword}
                  onChange={(event) => setAccountPassword(event.target.value)}
                  placeholder="At least 8 characters"
                />
                {accountPasswordError && accountPassword.length > 0 && (
                  <p style={{ color: "var(--warning)", marginTop: 6 }}>
                    {accountPasswordError}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {step === 1 && (
          <section style={{ maxWidth: 760, display: "grid", gap: 22 }}>
            <div>
              <div className="meta-text" style={{ marginBottom: 10 }}>
                Static Anchors 1/2
              </div>
              <h1 style={{ fontSize: 34, marginBottom: 10 }}>
                Timezone, role, and day rhythm
              </h1>
            </div>

            <div
              style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 16 }}
            >
              <label htmlFor="timezone">Timezone (IANA)</label>
              <input
                id="timezone"
                list="tz-list"
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
              />
              <datalist id="tz-list">
                {timezoneOptions.map((tz) => (
                  <option key={tz} value={tz} />
                ))}
              </datalist>
              {timezoneError && (
                <p style={{ color: "var(--warning)", marginTop: 6 }}>
                  {timezoneError}
                </p>
              )}
            </div>

            <div
              style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 16 }}
            >
              <div className="step-title">Primary role</div>
              <div style={{ display: "grid", gap: 8 }}>
                {ROLE_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 0,
                      textTransform: "none",
                      letterSpacing: 0,
                      color: "var(--ink)",
                    }}
                  >
                    <input
                      type="radio"
                      checked={role === option.value}
                      onChange={() => setRole(option.value)}
                      style={{ width: 14, height: 14 }}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
              {roleError && (
                <p style={{ color: "var(--warning)", marginTop: 6 }}>
                  {roleError}
                </p>
              )}
            </div>

            <div
              style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 16 }}
            >
              <div className="step-title">Sleep and wake</div>
              <TimeRangeSlider
                idPrefix="wake-sleep"
                startMin={sleepMin}
                endMin={wakeMin}
                onChangeStart={setSleepMin}
                onChangeEnd={setWakeMin}
                startLabel="Sleep expected"
                endLabel="Wake up"
              />
              {wakeSleepError && (
                <p style={{ color: "var(--warning)", marginTop: 6 }}>
                  {wakeSleepError}
                </p>
              )}
              {!wakeSleepError && wakeSleepWarning && (
                <p style={{ color: "var(--watch)", marginTop: 6 }}>
                  {wakeSleepWarning}
                </p>
              )}
            </div>
          </section>
        )}

        {step === 2 && (
          <section style={{ maxWidth: 880, display: "grid", gap: 24 }}>
            <div>
              <div className="meta-text" style={{ marginBottom: 10 }}>
                Static Anchors 2/2
              </div>
              <h1 style={{ fontSize: 34, marginBottom: 10 }}>
                Availability blocks
              </h1>
              <p style={{ color: "var(--muted)" }}>
                Add one list of blocks and we will map each item to both fixed
                commitments and hard exclusions.
              </p>
            </div>

            <div
              style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 16 }}
            >
              <div className="step-title">Availability blocks</div>
              {anchorBlocks.length === 0 && (
                <p style={{ color: "var(--muted)", marginBottom: 10 }}>
                  Add at least one recurring block.
                </p>
              )}

              <div style={{ display: "grid", gap: 12 }}>
                {anchorBlocks.map((item, index) => (
                  <div
                    key={item.id}
                    style={{ border: "0.5px solid var(--rule)", padding: 12 }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "2fr auto",
                        gap: 12,
                      }}
                    >
                      <div>
                        <label htmlFor={`anchor-name-${item.id}`}>Name</label>
                        <input
                          id={`anchor-name-${item.id}`}
                          value={item.name}
                          onChange={(event) => {
                            const value = event.target.value;
                            setAnchorBlocks((prev) =>
                              prev.map((current, i) =>
                                i === index
                                  ? { ...current, name: value }
                                  : current,
                              ),
                            );
                          }}
                          placeholder="Lecture, standup, no meetings"
                        />
                      </div>

                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => {
                          setAnchorBlocks((prev) =>
                            prev.filter((row) => row.id !== item.id),
                          );
                        }}
                        style={{ alignSelf: "end" }}
                      >
                        Remove
                      </button>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <TimeRangeSlider
                        idPrefix={`anchor-${item.id}`}
                        startMin={item.start_min}
                        endMin={item.end_min}
                        onChangeStart={(value) => {
                          setAnchorBlocks((prev) =>
                            prev.map((current, i) =>
                              i === index
                                ? { ...current, start_min: value }
                                : current,
                            ),
                          );
                        }}
                        onChangeEnd={(value) => {
                          setAnchorBlocks((prev) =>
                            prev.map((current, i) =>
                              i === index
                                ? { ...current, end_min: value }
                                : current,
                            ),
                          );
                        }}
                      />
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <p className="meta-text" style={{ marginBottom: 6 }}>
                        Days
                      </p>
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: 8,
                        }}
                      >
                        {DAYS.map((day, dayIndex) => {
                          const active = item.days.includes(dayIndex);
                          return (
                            <button
                              key={`${item.id}-${day}`}
                              type="button"
                              className="btn btn-sm"
                              onClick={() => {
                                setAnchorBlocks((prev) =>
                                  prev.map((current, i) =>
                                    i === index
                                      ? {
                                          ...current,
                                          days: toggleDay(
                                            current.days,
                                            dayIndex,
                                          ),
                                        }
                                      : current,
                                  ),
                                );
                              }}
                              style={{
                                opacity: active ? 1 : 0.5,
                                minWidth: 52,
                                justifyContent: "center",
                              }}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {anchorErrors[index].length > 0 && (
                      <p style={{ color: "var(--warning)", marginTop: 8 }}>
                        {anchorErrors[index][0]}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="btn btn-sm"
                onClick={addAnchorBlock}
                disabled={!canAddAnchor}
                style={{ marginTop: 10, opacity: canAddAnchor ? 1 : 0.45 }}
              >
                + Add availability block
              </button>
            </div>
          </section>
        )}

        {step === 3 && (
          <section style={{ maxWidth: 860, display: "grid", gap: 24 }}>
            <div>
              <div className="meta-text" style={{ marginBottom: 10 }}>
                Seeded Preferences 1/2
              </div>
              <h1 style={{ fontSize: 34, marginBottom: 10 }}>
                Focus and low-energy windows
              </h1>
            </div>

            <div
              style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 16 }}
            >
              <div className="step-title">Peak-focus windows (max 2)</div>
              {peakFocusWindows.length === 0 && (
                <p style={{ color: "var(--muted)", marginBottom: 10 }}>
                  Optional. Add up to two windows when your focus is strongest.
                </p>
              )}

              <div style={{ display: "grid", gap: 12 }}>
                {peakFocusWindows.map((item, index) => (
                  <div
                    key={item.id}
                    style={{ border: "0.5px solid var(--rule)", padding: 12 }}
                  >
                    <TimeRangeSlider
                      idPrefix={`peak-${item.id}`}
                      startMin={item.start_min}
                      endMin={item.end_min}
                      onChangeStart={(value) => {
                        setPeakFocusWindows((prev) =>
                          prev.map((current, i) =>
                            i === index
                              ? { ...current, start_min: value }
                              : current,
                          ),
                        );
                      }}
                      onChangeEnd={(value) => {
                        setPeakFocusWindows((prev) =>
                          prev.map((current, i) =>
                            i === index
                              ? { ...current, end_min: value }
                              : current,
                          ),
                        );
                      }}
                    />
                    {peakErrors[index].length > 0 && (
                      <p style={{ color: "var(--warning)", marginTop: 8 }}>
                        {peakErrors[index][0]}
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        setPeakFocusWindows((prev) =>
                          prev.filter((row) => row.id !== item.id),
                        );
                      }}
                      style={{ marginTop: 10 }}
                    >
                      Remove window
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="btn btn-sm"
                onClick={addPeakWindow}
                disabled={!canAddPeak}
                style={{ marginTop: 10, opacity: canAddPeak ? 1 : 0.45 }}
              >
                + Add peak window
              </button>
            </div>

            <div
              style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 16 }}
            >
              <div className="step-title">Low-energy windows (max 2)</div>
              {lowEnergyWindows.length === 0 && (
                <p style={{ color: "var(--muted)", marginBottom: 10 }}>
                  Optional. Adding at least one helps us schedule better.
                </p>
              )}

              <div style={{ display: "grid", gap: 12 }}>
                {lowEnergyWindows.map((item, index) => (
                  <div
                    key={item.id}
                    style={{ border: "0.5px solid var(--rule)", padding: 12 }}
                  >
                    <TimeRangeSlider
                      idPrefix={`low-${item.id}`}
                      startMin={item.start_min}
                      endMin={item.end_min}
                      onChangeStart={(value) => {
                        setLowEnergyWindows((prev) =>
                          prev.map((current, i) =>
                            i === index
                              ? { ...current, start_min: value }
                              : current,
                          ),
                        );
                      }}
                      onChangeEnd={(value) => {
                        setLowEnergyWindows((prev) =>
                          prev.map((current, i) =>
                            i === index
                              ? { ...current, end_min: value }
                              : current,
                          ),
                        );
                      }}
                    />
                    {lowErrors[index].length > 0 && (
                      <p style={{ color: "var(--warning)", marginTop: 8 }}>
                        {lowErrors[index][0]}
                      </p>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={() => {
                        setLowEnergyWindows((prev) =>
                          prev.filter((row) => row.id !== item.id),
                        );
                      }}
                      style={{ marginTop: 10 }}
                    >
                      Remove window
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="btn btn-sm"
                onClick={addLowWindow}
                disabled={!canAddLow}
                style={{ marginTop: 10, opacity: canAddLow ? 1 : 0.45 }}
              >
                + Add low-energy window
              </button>

              {crossWindowWarning && (
                <p style={{ color: "var(--watch)", marginTop: 10 }}>
                  {crossWindowWarning}
                </p>
              )}
            </div>
          </section>
        )}

        {step === 4 && (
          <section style={{ maxWidth: 860, display: "grid", gap: 24 }}>
            <div>
              <div className="meta-text" style={{ marginBottom: 10 }}>
                Seeded Preferences 2/2
              </div>
              <h1 style={{ fontSize: 34, marginBottom: 10 }}>
                Session style and recovery plan
              </h1>
            </div>

            <div
              style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 16 }}
            >
              <div className="step-title">Session config</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                <div>
                  <label htmlFor="session-style">Session style</label>
                  <select
                    id="session-style"
                    value={sessionStyle}
                    onChange={(event) =>
                      setSessionStyle(
                        Number(event.target.value) as SessionStyleIndex,
                      )
                    }
                  >
                    {SESSION_STYLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="switch-buffer">Switch buffer</label>
                  <select
                    id="switch-buffer"
                    value={switchBuffer}
                    onChange={(event) =>
                      setSwitchBuffer(
                        Number(event.target.value) as SwitchBufferIndex,
                      )
                    }
                  >
                    {SWITCH_BUFFER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div
              style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 16 }}
            >
              <div className="step-title">Deadline style</div>
              <select
                value={deadlineStyle}
                onChange={(event) =>
                  setDeadlineStyle(
                    Number(event.target.value) as DeadlineStyleIndex,
                  )
                }
              >
                {DEADLINE_STYLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 16 }}
            >
              <div className="step-title">Recovery activity</div>
              <p style={{ color: "var(--muted)", marginBottom: 10 }}>
                Keep one activity that reliably helps you reset energy.
              </p>

              <div style={{ border: "0.5px solid var(--rule)", padding: 12 }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "2fr 1fr",
                    gap: 12,
                  }}
                >
                  <div>
                    <label htmlFor={`recovery-name-${recoveryActivity.id}`}>
                      Name
                    </label>
                    <input
                      id={`recovery-name-${recoveryActivity.id}`}
                      value={recoveryActivity.name}
                      onChange={(event) => {
                        const value = event.target.value;
                        setRecoveryActivity((prev) => ({
                          ...prev,
                          name: value,
                        }));
                      }}
                    />
                  </div>

                  <div>
                    <label htmlFor={`recovery-duration-${recoveryActivity.id}`}>
                      Duration (min)
                    </label>
                    <input
                      id={`recovery-duration-${recoveryActivity.id}`}
                      type="number"
                      min={5}
                      max={180}
                      step={5}
                      value={recoveryActivity.duration_min}
                      onChange={(event) => {
                        const value = normalizeDuration(
                          Number(event.target.value),
                        );
                        setRecoveryActivity((prev) => ({
                          ...prev,
                          duration_min: value,
                        }));
                      }}
                    />
                  </div>
                </div>

                <div style={{ marginTop: 10 }}>
                  <label
                    htmlFor={`recovery-duration-slider-${recoveryActivity.id}`}
                  >
                    Duration slider
                  </label>
                  <input
                    id={`recovery-duration-slider-${recoveryActivity.id}`}
                    type="range"
                    min={5}
                    max={180}
                    step={5}
                    value={recoveryActivity.duration_min}
                    onChange={(event) => {
                      const value = normalizeDuration(
                        Number(event.target.value),
                      );
                      setRecoveryActivity((prev) => ({
                        ...prev,
                        duration_min: value,
                      }));
                    }}
                  />
                </div>

                <div style={{ marginTop: 10 }}>
                  <label htmlFor={`recovery-energy-${recoveryActivity.id}`}>
                    Energy value ({recoveryActivity.energy_value.toFixed(1)})
                  </label>
                  <input
                    id={`recovery-energy-${recoveryActivity.id}`}
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.1}
                    value={recoveryActivity.energy_value}
                    onChange={(event) => {
                      const value = normalizeEnergy(Number(event.target.value));
                      setRecoveryActivity((prev) => ({
                        ...prev,
                        energy_value: value,
                      }));
                    }}
                  />
                </div>

                {recoveryError && (
                  <p style={{ color: "var(--warning)", marginTop: 8 }}>
                    {recoveryError}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        <div
          style={{
            marginTop: 28,
            borderTop: "0.5px solid var(--ink)",
            paddingTop: 14,
            display: "flex",
            gap: 10,
            alignItems: "center",
          }}
        >
          <button
            type="button"
            className="btn"
            onClick={goBack}
            disabled={step === 0}
          >
            Back
          </button>
          {step < 4 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={goNext}
              disabled={stepHasErrors}
              style={{ opacity: stepHasErrors ? 0.45 : 1 }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              onClick={submitOnboarding}
              disabled={stepHasErrors || isSubmitting}
              style={{ opacity: stepHasErrors || isSubmitting ? 0.45 : 1 }}
            >
              {isSubmitting ? "Creating account..." : "Finish & Go to Dashboard"}
            </button>
          )}
          {stepHasErrors && (
            <p style={{ color: "var(--warning)" }}>
              Complete this step to continue.
            </p>
          )}
          {submitError && (
            <p style={{ color: "var(--warning)" }}>{submitError}</p>
          )}
        </div>
      </main>
    </div>
  );
}
