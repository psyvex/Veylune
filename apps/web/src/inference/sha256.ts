export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function verifyDigest(bytes: ArrayBuffer, expectedHex: string): Promise<boolean> {
  const actual = await sha256Hex(bytes);
  return actual === expectedHex.toLowerCase();
}
