import { evalAnswer, score } from '../src/engine/scoring.ts'
export function replay(deck, fixture) {
  const run = choices => {
    let total = 0
    let streak = 0
    let right = 0
    const items = deck.questions.map((q, i) => {
      const correct = evalAnswer(q, choices[i])
      const result = score(correct, q.kind, streak)
      streak = result.nextStreak
      total += result.points
      right += Number(correct)
      return { id: q.id, correct, points: result.points, streakBonus: result.streakBonus }
    })
    return { total, right, attempted: items.length, items }
  }
  return { correct: run(fixture.correct), wrong: run(fixture.wrong) }
}
