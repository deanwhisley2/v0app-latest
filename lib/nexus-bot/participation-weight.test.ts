import { computeParticipationWeight } from "./participation-weight"

function assertClose(actual: number, expected: number, tol = 0.001) {
  if (Math.abs(actual - expected) > tol) {
    throw new Error(`expected ~${expected}, got ${actual}`)
  }
}

function testEightHourSessionExamples() {
  const start = "2026-06-01T08:00:00.000Z"
  const end = "2026-06-01T16:00:00.000Z"

  assertClose(
    computeParticipationWeight({ sessionStartAt: start, sessionEndAt: end, joinedAt: "2026-06-01T07:00:00.000Z" }),
    1,
  )
  assertClose(
    computeParticipationWeight({ sessionStartAt: start, sessionEndAt: end, joinedAt: "2026-06-01T09:00:00.000Z" }),
    0.875,
  )
  assertClose(
    computeParticipationWeight({ sessionStartAt: start, sessionEndAt: end, joinedAt: "2026-06-01T11:00:00.000Z" }),
    0.625,
  )
  assertClose(
    computeParticipationWeight({ sessionStartAt: start, sessionEndAt: end, joinedAt: "2026-06-01T14:00:00.000Z" }),
    0.25,
  )
  assertClose(
    computeParticipationWeight({ sessionStartAt: start, sessionEndAt: end, joinedAt: "2026-06-01T15:00:00.000Z" }),
    0.125,
  )

  const late = computeParticipationWeight({
    sessionStartAt: start,
    sessionEndAt: end,
    joinedAt: "2026-06-01T15:55:00.000Z",
  })
  if (!(late > 0 && late < 0.02)) {
    throw new Error(`late join weight should be tiny but >0, got ${late}`)
  }

  const expired = computeParticipationWeight({
    sessionStartAt: start,
    sessionEndAt: end,
    joinedAt: "2026-06-01T16:00:00.000Z",
  })
  if (expired !== 0) throw new Error("join at end should be 0")
}

testEightHourSessionExamples()
console.log("participation-weight.test: OK")
