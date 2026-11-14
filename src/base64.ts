// The environment has `Uint8Array.fromBase64` and `toBase64`; the `lib` the plugin is checked against does not name them.
type Decoder = { fromBase64(text: string): Uint8Array }
type Encoder = { toBase64(): string }

export const fromBase64 = (text: string): Uint8Array => (Uint8Array as unknown as Decoder).fromBase64(text)

export const toBase64 = (bytes: Uint8Array): string => (bytes as unknown as Encoder).toBase64()
