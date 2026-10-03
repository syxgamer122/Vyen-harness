import { describe, expect, it } from 'vitest';
import {
  MESSAGE_QUEUE_CAP,
  drainQueue,
  enqueueMessage,
  isQueueMode,
} from '@/lib/message-queue';

describe('drainQueue — QueueMode', () => {
  it('rỗng → không lấy gì', () => {
    expect(drainQueue([], 'one-at-a-time')).toEqual({ taken: [], rest: [] });
    expect(drainQueue([], 'all')).toEqual({ taken: [], rest: [] });
  });

  it('one-at-a-time chỉ lấy tin cũ nhất', () => {
    expect(drainQueue(['a', 'b', 'c'], 'one-at-a-time')).toEqual({ taken: ['a'], rest: ['b', 'c'] });
  });

  it('all lấy hết', () => {
    expect(drainQueue(['a', 'b'], 'all')).toEqual({ taken: ['a', 'b'], rest: [] });
  });

  it('không mutate mảng đầu vào', () => {
    const q = ['a', 'b'];
    drainQueue(q, 'all');
    expect(q).toEqual(['a', 'b']);
  });
});

describe('enqueueMessage — trần hàng đợi', () => {
  it(`vượt trần ${MESSAGE_QUEUE_CAP} thì bỏ tin mới, giữ tin cũ`, () => {
    const full = Array.from({ length: MESSAGE_QUEUE_CAP }, (_, i) => `m${i}`);
    const r = enqueueMessage(full, 'mới');
    expect(r.dropped).toBe(true);
    expect(r.queue).toEqual(full);
  });

  it('chưa đầy thì thêm vào cuối', () => {
    const r = enqueueMessage(['a'], 'b');
    expect(r.dropped).toBe(false);
    expect(r.queue).toEqual(['a', 'b']);
  });
});

describe('isQueueMode', () => {
  it('isQueueMode chỉ nhận 2 giá trị Pi', () => {
    expect(isQueueMode('all')).toBe(true);
    expect(isQueueMode('one-at-a-time')).toBe(true);
    expect(isQueueMode('first')).toBe(false);
    expect(isQueueMode(undefined)).toBe(false);
  });
});
