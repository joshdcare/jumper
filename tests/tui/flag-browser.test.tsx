import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render } from 'ink-testing-library';
import { FlagBrowser } from '../../src/tui/flag-browser.js';

const searchFlagsMock = vi.fn();
const toggleFlagMock = vi.fn();

vi.mock('../../src/api/launchdarkly.js', () => ({
  LDClient: class {
    searchFlags = searchFlagsMock;
    toggleFlag = toggleFlagMock;
  },
}));

describe('FlagBrowser', () => {
  let originalToken: string | undefined;
  let originalProject: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalToken = process.env.LD_API_TOKEN;
    originalProject = process.env.LD_PROJECT_KEY;
    searchFlagsMock.mockResolvedValue([]);
    toggleFlagMock.mockImplementation(async (_key: string, _env: string, _state: boolean) => ({
      key: 'k',
      name: 'n',
      on: true,
    }));
  });

  afterEach(() => {
    if (originalToken !== undefined) process.env.LD_API_TOKEN = originalToken;
    else delete process.env.LD_API_TOKEN;
    if (originalProject !== undefined) process.env.LD_PROJECT_KEY = originalProject;
    else delete process.env.LD_PROJECT_KEY;
  });

  it('renders header with environment name', async () => {
    process.env.LD_API_TOKEN = 'test-token';
    process.env.LD_PROJECT_KEY = 'test-project';

    const inst = render(<FlagBrowser env="dev" />);

    await vi.waitFor(
      () => {
        expect(inst.lastFrame()).toContain('Feature Flags');
        expect(inst.lastFrame()).toContain('dev');
      },
      { timeout: 3000 }
    );

    await vi.waitFor(
      () => {
        expect(searchFlagsMock).toHaveBeenCalledWith('', 'dev');
      },
      { timeout: 3000 }
    );

    inst.unmount();
  });

  it('shows missing config message when LD_API_TOKEN is not set', async () => {
    delete process.env.LD_API_TOKEN;
    delete process.env.LD_PROJECT_KEY;
    searchFlagsMock.mockClear();

    const inst = render(<FlagBrowser env="stg" />);
    const frame = inst.lastFrame()!;

    expect(frame).toContain('LD_API_TOKEN');
    expect(frame).toContain('LD_PROJECT_KEY');
    expect(searchFlagsMock).not.toHaveBeenCalled();
    inst.unmount();
  });
});
