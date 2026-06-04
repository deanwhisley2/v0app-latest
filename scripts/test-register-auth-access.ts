#!/usr/bin/env npx tsx
import { authEmailConfirmedAtRegister } from "../lib/server/register-auth-access"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

assert(authEmailConfirmedAtRegister(false, null) === true, "phone-only path")
assert(authEmailConfirmedAtRegister(true, "0701081851") === true, "email+phone allows login")
assert(authEmailConfirmedAtRegister(true, null) === false, "email-only waits verify")
assert(authEmailConfirmedAtRegister(true, "") === false, "email-only empty phone")

console.log("test-register-auth-access: PASS")
