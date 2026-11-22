// Monaco AtomicTabMoveOperations → lite-monaco core/edit/atomictabs(同名纯函数,0 起偏移)。
import { whitespaceVisibleColumn, atomicTabPosition, Direction as D } from '../../../../src/core/edit/atomictabs'

export const Direction = { Left: D.Left, Right: D.Right, Nearest: D.Nearest }
export const AtomicTabMoveOperations = { whitespaceVisibleColumn, atomicPosition: atomicTabPosition }
