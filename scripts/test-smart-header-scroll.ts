import { computeSmartHeaderVisibility } from "@/lib/mobile/smart-header-scroll"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function main() {
  let state = { lastY: 0, hidden: false }

  let r = computeSmartHeaderVisibility(state, 400)
  state = { lastY: r.nextLastY, hidden: r.hidden }
  assert(state.hidden === true, "scroll down from top hides")

  r = computeSmartHeaderVisibility(state, 390)
  state = { lastY: r.nextLastY, hidden: r.hidden }
  assert(state.hidden === false, "small scroll up reveals")

  state = { lastY: 50, hidden: true }
  r = computeSmartHeaderVisibility(state, 8)
  assert(r.hidden === false && r.atTop === true, "near top always shows")

  console.log("test-smart-header-scroll: OK")
}

main()
