import { absoluteUrl } from './routing.ts';

export const gameUrl = (code: string) => absoluteUrl(`/g/${code}`);

/**
 * Native share sheet on mobile, clipboard everywhere else. Returns which one
 * happened so the caller can show "Copied!" only when that's the truth.
 */
export async function shareGame(code: string): Promise<'shared' | 'copied' | 'failed'> {
  const url = gameUrl(code);
  const data = {
    title: 'ChipTable',
    text: `Join my poker table — room ${code}`,
    url,
  };

  if (navigator.share && navigator.canShare?.(data) !== false) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch {
      // User dismissed the sheet, or share isn't allowed here — fall through.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
}
