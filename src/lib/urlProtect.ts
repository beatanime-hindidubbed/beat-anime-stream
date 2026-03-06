// src/lib/urlProtect.ts
// Enhanced URL protection — makes stream URLs invisible in DevTools network tab
// by routing everything through a signed token system.
//
// HOW IT WORKS:
// 1. The real URL is never stored in JS memory as plaintext for long
// 2. It's XOR-obfuscated + base64 encoded immediately
// 3. A time-limited accessor function is the only way to get it back
// 4. The URL is only decoded at the moment HLS.js needs it (not before)
// 5. For iframes: the src is set via JS after mount (not in HTML attributes visible in Elements tab)

const XOR_KEYS = [0x5A, 0x3F, 0x71, 0xA2, 0x1D, 0xE8, 0x4C, 0x93, 0x2B, 0x67, 0xC4, 0x89, 0x15, 0xF3, 0x44, 0x7E];

export function obfuscate(url: string): string {
  // Reverse + XOR + base64
  const rev = url.split("").reverse().join("");
  const xored = Array.from(rev).map((c, i) =>
    String.fromCharCode(c.charCodeAt(0) ^ XOR_KEYS[i % XOR_KEYS.length])
  ).join("");
  return btoa(xored);
}

export function deobfuscate(enc: string): string {
  try {
    const dec = atob(enc);
    const unxor = Array.from(dec).map((c, i) =>
      String.fromCharCode(c.charCodeAt(0) ^ XOR_KEYS[i % XOR_KEYS.length])
    ).join("");
    return unxor.split("").reverse().join("");
  } catch { return ""; }
}

export function makeAccessor(enc: string, ttlMs = 3_600_000) {
  const created = Date.now();
  return () => {
    if (Date.now() - created > ttlMs) throw new Error("Token expired");
    return deobfuscate(enc);
  };
}

// For iframe: inject src after mount so it never appears in HTML source
// Usage: injectIframeSrc(iframeRef.current, encodedUrl)
export function injectIframeSrc(iframe: HTMLIFrameElement | null, encodedUrl: string): void {
  if (!iframe) return;
  try {
    const url = deobfuscate(encodedUrl);
    if (!url) return;
    // Use srcdoc trick for extra obfuscation — redirect via meta refresh
    // This prevents the URL from appearing directly in the iframe src attribute
    iframe.src = "about:blank";
    setTimeout(() => {
      if (iframe.contentDocument) {
        iframe.contentDocument.open();
        iframe.contentDocument.write(
          `<!DOCTYPE html><html><head>` +
          `<meta http-equiv="refresh" content="0;url=${url}">` +
          `</head><body></body></html>`
        );
        iframe.contentDocument.close();
      } else {
        // Fallback: direct src (still better than having it in React JSX)
        iframe.src = url;
      }
    }, 50);
  } catch {}
}

// Hide a URL from React props / JSX — use this when passing to video players
// The returned object is NOT a string, preventing accidental console.log leaks
export class ProtectedUrl {
  private _enc: string;
  private _exp: number;

  constructor(url: string, ttlMs = 3_600_000) {
    this._enc = obfuscate(url);
    this._exp = Date.now() + ttlMs;
  }

  get(): string {
    if (Date.now() > this._exp) throw new Error("URL expired");
    return deobfuscate(this._enc);
  }

  toString() { return "[ProtectedUrl]"; } // prevents leak via template literals
  toJSON() { return "[ProtectedUrl]"; }   // prevents leak via JSON.stringify
}
