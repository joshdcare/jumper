import { describe, it, expect, vi } from 'vitest';
import { RunEmitter, consoleAdapter } from '../../src/tui/emitter.js';
import type { RunEvent } from '../../src/tui/emitter.js';

describe('RunEmitter', () => {
  it('emits and receives events', () => {
    const emitter = new RunEmitter();
    const received: RunEvent[] = [];
    emitter.on('event', (e: RunEvent) => received.push(e));
    emitter.emit('event', { type: 'info', message: 'hello' });
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ type: 'info', message: 'hello' });
  });

  it('emits step lifecycle events', () => {
    const emitter = new RunEmitter();
    const received: RunEvent[] = [];
    emitter.on('event', (e: RunEvent) => received.push(e));
    emitter.stepStart('account-created', 'Create provider account');
    emitter.stepComplete('account-created');
    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({ type: 'step-start', step: 'account-created', description: 'Create provider account' });
    expect(received[1]).toEqual({ type: 'step-complete', step: 'account-created' });
  });

  it('emits network events', () => {
    const emitter = new RunEmitter();
    const received: RunEvent[] = [];
    emitter.on('event', (e: RunEvent) => received.push(e));
    emitter.networkRequest('POST', '/api/graphql', '{"query":"..."}');
    emitter.networkResponse(200, '/api/graphql', 312, '{"data":{}}');
    expect(received).toHaveLength(2);
    expect(received[0].type).toBe('network-request');
    expect(received[1].type).toBe('network-response');
  });
});

describe('consoleAdapter', () => {
  it('writes step events to console.log', () => {
    const emitter = new RunEmitter();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleAdapter(emitter);
    emitter.stepStart('account-created', 'Create provider account');
    emitter.stepComplete('account-created');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('account-created'));
    spy.mockRestore();
  });

  it('writes network events to console.log', () => {
    const emitter = new RunEmitter();
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleAdapter(emitter);
    emitter.networkRequest('POST', '/api/graphql');
    emitter.networkResponse(200, '/api/graphql', 312);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('POST'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('200'));
    spy.mockRestore();
  });
});
