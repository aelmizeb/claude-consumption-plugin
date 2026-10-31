// The environment has them; `lib: es2023` does not name them.
interface Uint8Array {
  toBase64(): string
}

interface Uint8ArrayConstructor {
  fromBase64(base64: string): Uint8Array
}
