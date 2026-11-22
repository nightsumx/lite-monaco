declare module 'virtual:parity' {
    const data: { files: { group: 'A' | 'B' | 'C' | 'NA', file: string, pass: number, total: number, reason: string }[] }
    export default data
}
