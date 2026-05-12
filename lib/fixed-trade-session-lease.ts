/** Lease end for fixed-trade sessions — must match server settlement routes. */
export function officialLeaseEndDate(createdAtIso: string, fixPeriodMonths: number): Date {
  const d = new Date(createdAtIso)
  d.setMonth(d.getMonth() + fixPeriodMonths)
  return d
}
