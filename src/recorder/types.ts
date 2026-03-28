// src/recorder/types.ts
export interface ReportContext {
  email: string;
  password: string;
  memberId: string | null;
  uuid: string | null;
  authToken: string | null;
  accessToken: string | null;
  vertical: string | null;
}

export interface ReportRequest {
  method: string;
  url: string;
  status: number | null;
  duration: number;
  requestBody: string | null;
  responseBody: string | null;
  timestamp: string;
}

export interface ReportStep {
  name: string;
  status: 'pass' | 'fail' | 'skipped';
  duration: number;
  startedAt: string;
  requests: ReportRequest[];
  screenshot: string | null;
  error: string | null;
}

export interface ReportError {
  step: string;
  message: string;
  stack: string;
  timestamp: string;
}

export interface ReportMeta {
  timestamp: string;
  platform: 'mobile' | 'web';
  vertical: string;
  tier: string;
  targetStep: string;
  totalDuration: number;
  outcome: 'pass' | 'fail';
}

export interface RunReport {
  meta: ReportMeta;
  context: ReportContext;
  steps: ReportStep[];
  errors: ReportError[];
}
