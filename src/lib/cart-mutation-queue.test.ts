import { describe, expect, it, vi } from 'vitest';
import { CartMutationQueue } from './cart-mutation-queue';

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('cart mutation ordering', () => {
  it('coalesces later quantities and sends delete after the in-flight write', async () => {
    const first = deferred();
    const send = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const committed = vi.fn();
    const queue = new CartMutationQueue({
      send,
      committed,
      failed: vi.fn(),
      idle: vi.fn(),
    });
    queue.set('a', 2);
    queue.set('a', 3);
    queue.set('a', 4);
    queue.set('a', null);
    expect(send).toHaveBeenCalledTimes(1);
    first.resolve();
    await vi.waitFor(() => expect(committed).toHaveBeenCalledWith('a', null));
    expect(send.mock.calls).toEqual([
      ['a', 2],
      ['a', null],
    ]);
  });

  it('keeps another row independent and rolls back only the latest failed intent', async () => {
    const first = deferred();
    const failed = vi.fn();
    const send = vi.fn((id: string) =>
      id === 'a' ? first.promise : Promise.resolve(),
    );
    const committed = vi.fn();
    const queue = new CartMutationQueue({
      send,
      committed,
      failed,
      idle: vi.fn(),
    });
    queue.set('a', 2);
    queue.set('b', 5);
    await vi.waitFor(() => expect(committed).toHaveBeenCalledWith('b', 5));
    first.reject(new Error('failed'));
    await vi.waitFor(() =>
      expect(failed).toHaveBeenCalledWith('a', expect.any(Error)),
    );
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('continues newer intent after an earlier failure without reverting the UI', async () => {
    const first = deferred();
    const failed = vi.fn();
    const committed = vi.fn();
    const send = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const queue = new CartMutationQueue({
      send,
      committed,
      failed,
      idle: vi.fn(),
    });
    queue.set('a', 2);
    queue.set('a', 3);
    first.reject(new Error('failed'));
    await vi.waitFor(() => expect(committed).toHaveBeenCalledWith('a', 3));
    expect(failed).not.toHaveBeenCalled();
  });
});
