import {
  computeSmartHeaderVisibility,
  shouldRevealSmartHeaderInstantly,
} from "@/lib/mobile/smart-header-scroll"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function main() {
  let state = { lastY: 0, hidden: false }

  let r = computeSmartHeaderVisibility(state, 400)
  state = { lastY: r.nextLastY, hidden: r.hidden }
  assert(state.hidden === true, "scroll down from top hides")

  state = { lastY: 400, hidden: true }
  assert(shouldRevealSmartHeaderInstantly(state, 399) === true, "1px up reveals instantly flag")
  r = computeSmartHeaderVisibility(state, 399)
  assert(r.hidden === false, "1px up reveals in compute")

  state = { lastY: 200, hidden: true }
  r = computeSmartHeaderVisibility(state, 197)
  assert(r.hidden === false && r.atTop === false, "mid-page small scroll up reveals")

  state = { lastY: 50, hidden: true }
  r = computeSmartHeaderVisibility(state, 8)
  assert(r.hidden === false && r.atTop === true, "near top always shows")

  console.log("test-smart-header-scroll: OK")
}

main()
