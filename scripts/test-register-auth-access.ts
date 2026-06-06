#!/usr/bin/env npx tsx
import { authEmailConfirmedAtRegister } from "../lib/server/register-auth-access"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

assert(authEmailConfirmedAtRegister(false, null) === true, "phone-only path")
assert(authEmailConfirmedAtRegister(true, "0701081851") === true, "email+phone")
assert(authEmailConfirmedAtRegister(true, null) === true, "email-only non-blocking stabilization")
assert(authEmailConfirmedAtRegister(true, "") === true, "email-only empty phone")

console.log("test-register-auth-access: PASS")
