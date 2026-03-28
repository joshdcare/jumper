import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RunEmitter } from '../../src/tui/emitter.js';
import { RunRecorder } from '../../src/recorder/run-recorder.js';
import fs from 'fs';
import path from 'path';

const TEST_RUNS_DIR = path.resolve('test-runs-tmp');

describe('RunRecorder', () => {
  let recorder: RunRecorder;
  let emitter: RunEmitter;

  beforeEach(() => {
    emitter = new RunEmitter();
    recorder = new RunRecorder({
      platform: 'mobile',
      vertical: 'childcare',
      tier: 'premium',
      targetStep: 'account-created',
      runsDir: TEST_RUNS_DIR,
    });
    recorder.attach(emitter);
  });

  afterEach(() => {
    fs.rmSync(TEST_RUNS_DIR, { recursive: true, force: true });
  });

  it('creates the run directory on construction', () => {
    expect(fs.existsSync(recorder.runDir)).toBe(true);
  });

  it('collects step events into report steps', async () => {
    emitter.stepStart('account-created', 'Creating account');
    emitter.stepComplete('account-created');

    const report = await recorder.finish({ email: 'test@care.com', password: 'p' });
    expect(report.steps).toHaveLength(1);
    expect(report.steps[0].name).toBe('account-created');
    expect(report.steps[0].status).toBe('pass');
  });

  it('pairs network request/response into step requests', async () => {
    emitter.stepStart('account-created', 'Creating account');
    emitter.networkRequest('POST', '/platform/spi/enroll/lite', '{"email":"x"}');
    emitter.networkResponse(200, '/platform/spi/enroll/lite', 150, '{"data":{}}');
    emitter.stepComplete('account-created');

    const report = await recorder.finish({ email: 'test@care.com', password: 'p' });
    expect(report.steps[0].requests).toHaveLength(1);
    expect(report.steps[0].requests[0].method).toBe('POST');
    expect(report.steps[0].requests[0].status).toBe(200);
    expect(report.steps[0].requests[0].requestBody).toBe('{"email":"x"}');
    expect(report.steps[0].requests[0].responseBody).toBe('{"data":{}}');
  });

  it('records errors via recordError', async () => {
    emitter.stepStart('account-created', 'Creating account');
    emitter.stepError('account-created', 'enroll failed');
    recorder.recordError('account-created', new Error('enroll failed'));

    const report = await recorder.finish({ email: 'test@care.com', password: 'p' });
    expect(report.steps[0].status).toBe('fail');
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].step).toBe('account-created');
    expect(report.errors[0].stack).toContain('enroll failed');
  });

  it('writes report.json to runDir on finish', async () => {
    emitter.stepStart('account-created', 'Creating');
    emitter.stepComplete('account-created');

    await recorder.finish({ email: 'e@c.com', password: 'p' });

    const reportPath = path.join(recorder.runDir, 'report.json');
    expect(fs.existsSync(reportPath)).toBe(true);
    const json = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    expect(json.meta.platform).toBe('mobile');
    expect(json.meta.outcome).toBe('pass');
    expect(json.context.email).toBe('e@c.com');
  });

  it('records step duration and startedAt', async () => {
    emitter.stepStart('account-created', 'Creating account');
    await new Promise(r => setTimeout(r, 50));
    emitter.stepComplete('account-created');

    const report = await recorder.finish({ email: 'test@care.com', password: 'p' });
    expect(report.steps[0].startedAt).toBeTruthy();
    expect(report.steps[0].duration).toBeGreaterThanOrEqual(40);
  });

  it('sets meta.timestamp at construction time', async () => {
    emitter.stepStart('account-created', 'Creating');
    emitter.stepComplete('account-created');

    const report = await recorder.finish({ email: 'e@c.com', password: 'p' });
    expect(report.meta.timestamp).toBeTruthy();
    const ts = new Date(report.meta.timestamp).getTime();
    expect(ts).toBeLessThanOrEqual(Date.now());
    expect(ts).toBeGreaterThan(Date.now() - 10000);
  });

  it('creates run dir with correct naming pattern', () => {
    const dirName = path.basename(recorder.runDir);
    expect(dirName).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_mobile_childcare$/);
  });

  it('handles unpaired requests (no response)', async () => {
    emitter.stepStart('account-created', 'Creating account');
    emitter.networkRequest('POST', '/platform/spi/enroll/lite', '{"email":"x"}');
    emitter.stepComplete('account-created');

    const report = await recorder.finish({ email: 'test@care.com', password: 'p' });
    expect(report.steps[0].requests).toHaveLength(1);
    expect(report.steps[0].requests[0].status).toBeNull();
    expect(report.steps[0].requests[0].requestBody).toBe('{"email":"x"}');
    expect(report.steps[0].requests[0].responseBody).toBeNull();
  });

  it('normalizes ProviderContext to ReportContext (no extra fields)', async () => {
    emitter.stepStart('account-created', 'Creating');
    emitter.stepComplete('account-created');

    const report = await recorder.finish({
      email: 'e@c.com',
      password: 'p',
      memberId: '123',
    });
    expect(report.context).not.toHaveProperty('_eligibilityResponse');
    expect(report.context).not.toHaveProperty('tier');
    expect(report.context.email).toBe('e@c.com');
    expect(report.context.memberId).toBe('123');
  });

  it('is idempotent — second finish is a no-op', async () => {
    emitter.stepStart('account-created', 'Creating');
    emitter.stepComplete('account-created');

    const r1 = await recorder.finish({ email: 'a@b.com', password: 'p' });
    const r2 = await recorder.finish({ email: 'a@b.com', password: 'p' });
    expect(r1).toEqual(r2);
  });
});
