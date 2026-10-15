/**
 * Saving files and printing, with one code path for normal browsers and for the
 * locked-down frame the live demo runs in (where the host offers a `downloads`
 * capability and window.print() is unavailable).
 */
type DownloadsApi = { save(req: { filename: string; data: string | Blob | ArrayBuffer }): Promise<{ status: string }> };
type ClaudeHost = { use?: (name: string) => Promise<unknown> };

const host = (): ClaudeHost | undefined => (typeof window !== 'undefined' ? (window as unknown as { claude?: ClaudeHost }).claude : undefined);

/** True when the page runs inside the sandboxed demo frame. */
export const isEmbedded = (): boolean => typeof host()?.use === 'function';

/** Browser printing works everywhere except inside the demo frame. */
export const canPrint = (): boolean => !isEmbedded();

export type SaveResult = 'saved' | 'declined' | 'unsupported';

export async function saveFile(filename: string, data: string | Blob | ArrayBuffer, mime = 'application/octet-stream'): Promise<SaveResult> {
  if (isEmbedded()) {
    try {
      const dl = (await host()!.use!('downloads')) as DownloadsApi | null;
      if (!dl) return 'unsupported';
      await dl.save({ filename, data });
      return 'saved';
    } catch (e) {
      return (e as { code?: string })?.code === 'declined' ? 'declined' : 'unsupported';
    }
  }
  try {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'saved';
  } catch {
    return 'unsupported';
  }
}

/** CSV with a BOM so Excel opens Bangla text correctly. */
export const saveCsv = (filename: string, rows: (string | number)[][]) => {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return saveFile(filename, `﻿${rows.map((r) => r.map(esc).join(',')).join('\r\n')}`, 'text/csv;charset=utf-8');
};
