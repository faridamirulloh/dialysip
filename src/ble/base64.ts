const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export const encodeBase64 = (value: string) => {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(value);
  }

  let output = "";
  let index = 0;

  while (index < value.length) {
    const first = value.charCodeAt(index++) & 255;
    const second = index < value.length ? value.charCodeAt(index++) & 255 : Number.NaN;
    const third = index < value.length ? value.charCodeAt(index++) & 255 : Number.NaN;

    output += base64Alphabet[first >> 2];
    output += base64Alphabet[((first & 3) << 4) | (Number.isNaN(second) ? 0 : second >> 4)];
    output += Number.isNaN(second)
      ? "="
      : base64Alphabet[((second & 15) << 2) | (Number.isNaN(third) ? 0 : third >> 6)];
    output += Number.isNaN(third) ? "=" : base64Alphabet[third & 63];
  }

  return output;
};

export const decodeBase64 = (value: string) => {
  if (typeof globalThis.atob === "function") {
    return globalThis.atob(value);
  }

  const normalized = value.replace(/=+$/, "");
  let output = "";
  let buffer = 0;
  let bits = 0;

  for (const character of normalized) {
    const nextValue = base64Alphabet.indexOf(character);
    if (nextValue < 0) {
      continue;
    }

    buffer = (buffer << 6) | nextValue;
    bits += 6;

    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 255);
    }
  }

  return output;
};

export const encodeJsonBase64 = (value: unknown) => encodeBase64(JSON.stringify(value));

export const decodeJsonBase64 = <T>(value: string): T => {
  const decoded = decodeBase64(value).replace(/\0+$/g, "").trim();
  return JSON.parse(decoded) as T;
};
