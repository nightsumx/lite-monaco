export interface InitOrderHazard { file: string, name: string, readLine: number, declLine: number }
export function findInitOrderHazards(code: string, file?: string): InitOrderHazard[]
export interface CycleLoadRead { file: string, line: number, name: string, from: string }
export function findCycleLoadReads(srcDir: string): { hits: CycleLoadRead[], cycles: string[][] }
