type TimeWindow = { start_min: number; end_min: number };

type FixedCommitment = {
  title: string;
  start_min: number;
  end_min: number;
  days: number[];
  recurring?: boolean;
};

type HardExclusion = {
  label: string;
  start_min: number;
  end_min: number;
  days: number[];
};

type RecoveryActivity = {
  name: string;
  duration_min: number;
  energy_value: number;
};

type UnknownRecord = Record<string, unknown>;

export const USER_PROFILE_STORAGE_KEY = "axiom_user_profile";

export type OnboardingSubmissionForStorage = {
  timezone: string;
  role: number;
  wake_sleep: { wake: number; sleep: number };
  peak_focus_windows: TimeWindow[];
  low_energy_windows: TimeWindow[];
  fixed_commitments: FixedCommitment[];
  hard_exclusions: HardExclusion[];
  session_config: { session_style: number; switch_buffer: number };
  deadline_style: number;
  recovery_activities: RecoveryActivity[];
};

export type StoredUserProfile = {
  name: string;
  email: string;
  timezone: string;
  role: number;
  wake_time: number;
  sleep_time: number;
  peak_focus_windows: TimeWindow[];
  low_energy_windows: TimeWindow[];
  fixed_commitments: FixedCommitment[];
  hard_exclusions: HardExclusion[];
  session_style: number;
  switch_buffer: number;
  deadline_style: number;
  recovery_activities: RecoveryActivity[];
  onboarded_at: string;
};

export type ReportUserProfile = {
  name: string;
  timezone: string;
  role: number;
  wake_sleep: { wake: number; sleep: number };
  peak_focus_windows: TimeWindow[];
  low_energy_windows: TimeWindow[];
  fixed_commitments: FixedCommitment[];
  session_config: { session_style: number; switch_buffer: number };
  deadline_style: number;
  recovery_activities: RecoveryActivity[];
  onboarded_at: string;
};

function toNumber(value: unknown, fallback: number): number {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(num) ? num : fallback;
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function toDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const unique = new Set<number>();

  for (const day of value) {
    const parsed = toNumber(day, -1);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 6) {
      unique.add(parsed);
    }
  }

  return Array.from(unique).sort((a, b) => a - b);
}

function toTimeWindows(value: unknown): TimeWindow[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const row = (entry as UnknownRecord) ?? {};
      return {
        start_min: toNumber(row.start_min, 0),
        end_min: toNumber(row.end_min, 0),
      };
    })
    .filter((entry) => entry.end_min > entry.start_min);
}

function toFixedCommitments(value: unknown): FixedCommitment[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const row = (entry as UnknownRecord) ?? {};
      return {
        title: toStringValue(row.title, "Untitled"),
        start_min: toNumber(row.start_min, 0),
        end_min: toNumber(row.end_min, 0),
        days: toDays(row.days),
        recurring: row.recurring !== false,
      };
    })
    .filter(
      (entry) => entry.end_min > entry.start_min && entry.days.length > 0,
    );
}

function toHardExclusions(
  value: unknown,
  fallback: FixedCommitment[],
): HardExclusion[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        const row = (entry as UnknownRecord) ?? {};
        return {
          label: toStringValue(row.label, "Unavailable"),
          start_min: toNumber(row.start_min, 0),
          end_min: toNumber(row.end_min, 0),
          days: toDays(row.days),
        };
      })
      .filter(
        (entry) => entry.end_min > entry.start_min && entry.days.length > 0,
      );
  }

  return fallback.map((entry) => ({
    label: entry.title,
    start_min: entry.start_min,
    end_min: entry.end_min,
    days: entry.days,
  }));
}

function toRecoveryActivities(value: unknown): RecoveryActivity[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const row = (entry as UnknownRecord) ?? {};
      return {
        name: toStringValue(row.name, "Recovery"),
        duration_min: toNumber(row.duration_min, 20),
        energy_value: toNumber(row.energy_value, 1),
      };
    })
    .filter((entry) => entry.duration_min > 0);
}

function normalizeProfile(raw: unknown): StoredUserProfile | null {
  if (!raw || typeof raw !== "object") return null;

  const row = raw as UnknownRecord;
  const wakeSleep =
    row.wake_sleep && typeof row.wake_sleep === "object"
      ? (row.wake_sleep as UnknownRecord)
      : {};
  const sessionConfig =
    row.session_config && typeof row.session_config === "object"
      ? (row.session_config as UnknownRecord)
      : {};

  const fixedCommitments = toFixedCommitments(row.fixed_commitments);
  const wakeTime = toNumber(row.wake_time, toNumber(wakeSleep.wake, 420));
  const sleepTime = toNumber(row.sleep_time, toNumber(wakeSleep.sleep, 1380));

  return {
    name: toStringValue(row.name, ""),
    email: toStringValue(row.email, ""),
    timezone: toStringValue(row.timezone, "UTC"),
    role: toNumber(row.role, 0),
    wake_time: wakeTime,
    sleep_time: sleepTime,
    peak_focus_windows: toTimeWindows(row.peak_focus_windows),
    low_energy_windows: toTimeWindows(row.low_energy_windows),
    fixed_commitments: fixedCommitments,
    hard_exclusions: toHardExclusions(row.hard_exclusions, fixedCommitments),
    session_style: toNumber(
      row.session_style,
      toNumber(sessionConfig.session_style, 1),
    ),
    switch_buffer: toNumber(
      row.switch_buffer,
      toNumber(sessionConfig.switch_buffer, 1),
    ),
    deadline_style: toNumber(row.deadline_style, 1),
    recovery_activities: toRecoveryActivities(row.recovery_activities),
    onboarded_at: toStringValue(
      row.onboarded_at,
      toStringValue(row.created_at, new Date().toISOString()),
    ),
  };
}

export function buildStoredProfileFromOnboarding(
  name: string,
  email: string,
  payload: OnboardingSubmissionForStorage,
): StoredUserProfile {
  return {
    name,
    email,
    timezone: payload.timezone,
    role: payload.role,
    wake_time: payload.wake_sleep.wake,
    sleep_time: payload.wake_sleep.sleep,
    peak_focus_windows: payload.peak_focus_windows,
    low_energy_windows: payload.low_energy_windows,
    fixed_commitments: payload.fixed_commitments,
    hard_exclusions:
      payload.hard_exclusions.length > 0
        ? payload.hard_exclusions
        : payload.fixed_commitments.map((entry) => ({
            label: entry.title,
            start_min: entry.start_min,
            end_min: entry.end_min,
            days: entry.days,
          })),
    session_style: payload.session_config.session_style,
    switch_buffer: payload.session_config.switch_buffer,
    deadline_style: payload.deadline_style,
    recovery_activities: payload.recovery_activities,
    onboarded_at: new Date().toISOString(),
  };
}

export function toStoredUserProfileFromServerUser(
  user: unknown,
): StoredUserProfile | null {
  return normalizeProfile(user);
}

export function readStoredUserProfile(): StoredUserProfile | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_PROFILE_STORAGE_KEY);
  if (!raw) return null;

  try {
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeStoredUserProfile(profile: StoredUserProfile): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    USER_PROFILE_STORAGE_KEY,
    JSON.stringify(profile),
  );
}

export function toDashboardProfilePayload(profile: StoredUserProfile) {
  return {
    peak_focus_windows: profile.peak_focus_windows,
    low_energy_windows: profile.low_energy_windows,
    fixed_commitments: profile.fixed_commitments,
    hard_exclusions: profile.hard_exclusions,
    wake_time: profile.wake_time,
    sleep_time: profile.sleep_time,
  };
}

export function toReportProfile(profile: StoredUserProfile): ReportUserProfile {
  return {
    name: profile.name,
    timezone: profile.timezone,
    role: profile.role,
    wake_sleep: {
      wake: profile.wake_time,
      sleep: profile.sleep_time,
    },
    peak_focus_windows: profile.peak_focus_windows,
    low_energy_windows: profile.low_energy_windows,
    fixed_commitments: profile.fixed_commitments,
    session_config: {
      session_style: profile.session_style,
      switch_buffer: profile.switch_buffer,
    },
    deadline_style: profile.deadline_style,
    recovery_activities: profile.recovery_activities,
    onboarded_at: profile.onboarded_at,
  };
}
