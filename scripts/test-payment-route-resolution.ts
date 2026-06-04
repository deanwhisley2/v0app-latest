import {
  resolvePaymentRouteForNetwork,
  validatePaymentRoutePayee,
} from "../lib/payment-route-resolution"

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

const ugDesk = [
  {
    label: "MTN Mobile Money Uganda",
    value: "+256794152339",
    payment_type: "mtn_mobile_ug",
    payee_name: "AZIZZA NANKWANGA",
  },
  {
    label: "Airtel Money Uganda",
    value: "7095290",
    payment_type: "airtel_merchant_ug",
    merchant_id: "7095290",
    merchant_name: "Nexus Pro2",
    payee_name: "Nexus Pro2",
  },
]

function testAirtelNeverShowsMtnPayee() {
  const route = resolvePaymentRouteForNetwork(ugDesk, "Airtel", "AZIZZA NANKWANGA")
  assert(route?.valid === true, "airtel route valid")
  assert(route?.registeredPayeeName === "Nexus Pro2", "airtel payee is Nexus Pro2")
  assert(route?.payeeNumberOrMerchantId === "7095290", "merchant id")
  console.log("✓ Airtel route uses Nexus Pro2, not MTN desk name")
}

function testMtnShowsMtnPayee() {
  const route = resolvePaymentRouteForNetwork(ugDesk, "MTN", "AZIZZA NANKWANGA")
  if (!route) throw new Error("FAIL: missing mtn route")
  assert(route.valid === true, "mtn route valid")
  assert(route.registeredPayeeName === "AZIZZA NANKWANGA", "mtn payee")
  assert(route.payeeNumberOrMerchantId.includes("794152339"), "mtn number")
  console.log("✓ MTN route uses AZIZZA NANKWANGA")
}

function testContaminationBlocked() {
  const v = validatePaymentRoutePayee({
    paymentNumbers: ugDesk,
    networkToken: "AIRTEL",
    registeredPayeeName: "AZIZZA NANKWANGA",
    registeredPayeeNamesDesk: "AZIZZA NANKWANGA",
  })
  assert(v.valid === false, "airtel displaying mtn name blocked")
  assert(v.error === "AIRTEL_PAYEE_CONTAMINATED_WITH_DESK_MTN_NAME", `error=${v.error}`)
  console.log("✓ cross-route payee contamination blocked")
}

function main() {
  testAirtelNeverShowsMtnPayee()
  testMtnShowsMtnPayee()
  testContaminationBlocked()
  console.log("test-payment-route-resolution: OK")
}

main()
