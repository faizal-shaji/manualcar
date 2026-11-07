/**
 * Waits for the web font (loaded by index.html) so text isn't first drawn in a fallback font.
 * Gives up after a timeout, e.g. when offline.
 */
export async function waitForFont(timeoutMs = 2500) {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('700 40px "Fredoka"'),
        document.fonts.load('500 40px "Fredoka"'),
      ]),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    // The text falls back to a system font.
  }
}
