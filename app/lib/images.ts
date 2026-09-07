export function matchesImageType(bytes: ArrayBuffer, contentType: string) {
  const data = new Uint8Array(bytes);
  if (contentType === "image/jpeg") return data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  if (contentType === "image/png") return data.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => data[index] === value);
  if (contentType === "image/webp") return data.length >= 12 && new TextDecoder().decode(data.slice(0, 4)) === "RIFF" && new TextDecoder().decode(data.slice(8, 12)) === "WEBP";
  return false;
}
