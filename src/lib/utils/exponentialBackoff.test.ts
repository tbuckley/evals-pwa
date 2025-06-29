import { describe, it, expect, vi, afterEach } from 'vitest';
import { exponentialBackoff } from './exponentialBackoff';

describe('exponentialBackoff', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return the result on the first try if the function succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await exponentialBackoff(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry the function and eventually succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('success');

    const result = await exponentialBackoff(fn, { initialDelay: 1, maxRetries: 5 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw an error after max retries', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(exponentialBackoff(fn, { maxRetries: 3, initialDelay: 1 })).rejects.toThrow(
      'fail',
    );
    expect(fn).toHaveBeenCalledTimes(4); // 1 initial call + 3 retries
  });

  it('should call onRetry callback with correct arguments', async () => {
    const error = new Error('fail');
    const fn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('success');
    const onRetry = vi.fn();

    await exponentialBackoff(fn, { onRetry, initialDelay: 1, maxRetries: 2 });

    expect(onRetry).toHaveBeenCalledTimes(1);
    const [err, attempt, delay] = onRetry.mock.calls[0] as [Error, number, number];
    expect(err).toBe(error);
    expect(attempt).toBe(1);
    expect(delay).toBeGreaterThan(0);
  });

  it('should not call onRetry if the function succeeds on the first try', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const onRetry = vi.fn();
    await exponentialBackoff(fn, { onRetry });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('should use default options when none are provided', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

    const onRetry = vi.fn();

    await exponentialBackoff(fn, { onRetry });

    expect(onRetry).toHaveBeenCalledTimes(1);
    const delay = onRetry.mock.calls[0][2] as number;
    // Default initialDelay is 1000ms. With jitter it can be between 500 and 1000
    expect(delay).toBeGreaterThanOrEqual(1000 * 0.5);
    expect(delay).toBeLessThanOrEqual(1000);
  });

  it('should apply exponential backoff delay with jitter', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const onRetry = vi.fn();

    await exponentialBackoff(fn, {
      onRetry,
      initialDelay: 100,
      factor: 2,
      jitter: 0.5,
      maxRetries: 2,
    });

    expect(onRetry).toHaveBeenCalledTimes(2);

    const firstDelay = onRetry.mock.calls[0][2] as number;
    expect(firstDelay).toBeGreaterThanOrEqual(100 * (1 - 0.5));
    expect(firstDelay).toBeLessThanOrEqual(100);

    const secondDelay = onRetry.mock.calls[1][2] as number;
    const expectedSecondDelayBase = 100 * Math.pow(2, 1);
    expect(secondDelay).toBeGreaterThanOrEqual(expectedSecondDelayBase * (1 - 0.5));
    expect(secondDelay).toBeLessThanOrEqual(expectedSecondDelayBase);
  });

  it('should cap the delay at maxDelay', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

    const onRetry = vi.fn();

    await exponentialBackoff(fn, {
      onRetry,
      initialDelay: 1000,
      factor: 5,
      maxDelay: 2000,
      maxRetries: 1,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);

    const delay = onRetry.mock.calls[0][2] as number;
    expect(delay).toBeLessThanOrEqual(2000);
  });

  it('should handle errors in the onRetry callback gracefully', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail 1')).mockResolvedValue('success');
    const onRetry = vi.fn().mockImplementation(() => {
      throw new Error('onRetry failed');
    });
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      // Mute console.error
    });

    await exponentialBackoff(fn, { onRetry, initialDelay: 1, maxRetries: 1 });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error in onRetry callback:', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });
});
