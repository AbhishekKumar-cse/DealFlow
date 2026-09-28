const numberFromEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
};

const booleanFromEnv = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes';
};

export const appConfig = {
  demoPassword: process.env.DEMO_PASSWORD ?? '',
  sessionMaxAgeSeconds: numberFromEnv('NEXTAUTH_SESSION_MAX_AGE_SECONDS', 60 * 60 * 12),
  ai: {
    enabled: booleanFromEnv('AI_ENABLED', true),
    defaultTemperature: numberFromEnv('AI_DEFAULT_TEMPERATURE', 0.4),
    defaultMaxTokens: numberFromEnv('AI_DEFAULT_MAX_TOKENS', 800),
    riskTemperature: numberFromEnv('AI_RISK_TEMPERATURE', 0.3),
    riskMaxTokens: numberFromEnv('AI_RISK_MAX_TOKENS', 500),
    summaryTemperature: numberFromEnv('AI_SUMMARY_TEMPERATURE', 0.4),
    summaryMaxTokens: numberFromEnv('AI_SUMMARY_MAX_TOKENS', 500),
    talkingPointsTemperature: numberFromEnv('AI_TALKING_POINTS_TEMPERATURE', 0.6),
    talkingPointsMaxTokens: numberFromEnv('AI_TALKING_POINTS_MAX_TOKENS', 600),
  },
} as const;
