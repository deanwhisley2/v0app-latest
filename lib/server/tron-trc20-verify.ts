import {
  NEXUS_TRC20_RECEIVE_ADDRESS,
  USDT_TRC20_CONTRACT,
} from "@/lib/server/admin-payment-config"

const TRONGRID_BASE = (process.env.TRONGRID_API_URL ?? "https://api.trongrid.io").replace(/\/$/, "")
const USDT_DECIMALS = 6

export type Trc20TransferMatch = {
  txHash: string
  fromAddress: string
  toAddress: string
  amountUsdt: number
  confirmations: number
  blockNumber: number
  blockTimestampMs: number | null
  contractAddress: string
  success: boolean
}

function trongridHeaders(): HeadersInit {
  const key = process.env.TRONGRID_API_KEY?.trim()
  return key ? { "TRON-PRO-API-KEY": key } : {}
}

function normalizeTxHash(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isValidTronTxHash(hash: string): boolean {
  const h = normalizeTxHash(hash)
  return /^[0-9a-f]{64}$/.test(h)
}

function parseUsdtAmount(value: string | number | undefined): number {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 0
  return n / 10 ** USDT_DECIMALS
}

function base58ToHexAddress(base58: string): string | null {
  const a = base58.trim()
  if (!a.startsWith("T") || a.length < 30) return null
  return a
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${TRONGRID_BASE}${path}`, {
    headers: trongridHeaders(),
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`TronGrid ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

async function getLatestBlockNumber(): Promise<number> {
  const data = await fetchJson<{ block_header?: { raw_data?: { number?: number } } }>(
    "/wallet/getnowblock",
  )
  return Number(data?.block_header?.raw_data?.number ?? 0)
}

function confirmationsFromBlock(blockNumber: number, latest: number): number {
  if (blockNumber > 0 && latest >= blockNumber) return latest - blockNumber + 1
  return 0
}

/** TronGrid TRC20 list rows often omit block_number — resolve via wallet API (v1 tx routes 404 on many ids). */
async function fetchTxBlockMeta(txHash: string): Promise<{ blockNumber: number; blockTimestampMs: number | null }> {
  const res = await fetch(`${TRONGRID_BASE}/wallet/gettransactioninfobyid`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...trongridHeaders() },
    body: JSON.stringify({ value: txHash }),
    cache: "no-store",
  })
  if (!res.ok) {
    return { blockNumber: 0, blockTimestampMs: null }
  }
  const info = (await res.json()) as { blockNumber?: number; blockTimeStamp?: number }
  const blockNumber = Number(info?.blockNumber ?? 0)
  const blockTimestampMs = Number(info?.blockTimeStamp ?? 0) || null
  return { blockNumber, blockTimestampMs }
}

type Trc20Row = {
  transaction_id?: string
  from?: string
  to?: string
  value?: string
  token_info?: { address?: string; symbol?: string; decimals?: number }
  block_timestamp?: number
  block_number?: number
}

async function buildMatchFromRow(
  row: Trc20Row,
  txHash: string,
  receive: string,
  contract: string,
  latest: number,
): Promise<Trc20TransferMatch | null> {
  const toAddr = String(row.to ?? "")
  if (toAddr !== receive) return null
  const contractAddr = String(row.token_info?.address ?? contract)
  if (contractAddr.toLowerCase() !== contract.toLowerCase()) return null

  const meta = await fetchTxBlockMeta(txHash)
  const blockNumber = Number(row.block_number ?? 0) || meta.blockNumber
  const blockTimestampMs = Number(row.block_timestamp ?? 0) || meta.blockTimestampMs
  const confirmations = confirmationsFromBlock(blockNumber, latest)

  return {
    txHash,
    fromAddress: String(row.from ?? ""),
    toAddress: toAddr,
    amountUsdt: parseUsdtAmount(row.value),
    confirmations,
    blockNumber,
    blockTimestampMs: blockTimestampMs || null,
    contractAddress: contractAddr,
    success: true,
  }
}

/** Find a confirmed inbound USDT transfer by transaction id. */
export async function verifyTrc20DepositByTxHash(
  txHashRaw: string,
  expectedReceiveAddress: string = NEXUS_TRC20_RECEIVE_ADDRESS,
  tokenContract: string = USDT_TRC20_CONTRACT,
): Promise<Trc20TransferMatch | null> {
  const txHash = normalizeTxHash(txHashRaw)
  if (!isValidTronTxHash(txHash)) return null

  const receive = expectedReceiveAddress.trim()
  const contract = tokenContract.trim()
  const latest = await getLatestBlockNumber()

  const info = await fetchJson<{
    blockNumber?: number
    receipt?: { result?: string }
  }>(`/v1/transactions/${txHash}/info`).catch(() => null)

  if (info && String(info.receipt?.result ?? "").toUpperCase() === "FAILED") {
    return {
      txHash,
      fromAddress: "",
      toAddress: receive,
      amountUsdt: 0,
      confirmations: 0,
      blockNumber: Number(info.blockNumber ?? 0),
      blockTimestampMs: null,
      contractAddress: contract,
      success: false,
    }
  }

  let fingerprint: string | undefined
  for (let page = 0; page < 5; page++) {
    const qs = new URLSearchParams({
      only_confirmed: "true",
      limit: "200",
      contract_address: contract,
      only_to: "true",
    })
    if (fingerprint) qs.set("fingerprint", fingerprint)
    const rows = await fetchJson<{ data?: Trc20Row[]; meta?: { fingerprint?: string } }>(
      `/v1/accounts/${receive}/transactions/trc20?${qs.toString()}`,
    ).catch((): { data: Trc20Row[]; meta?: { fingerprint?: string } } => ({ data: [] }))

    const row = (rows.data ?? []).find((r) => normalizeTxHash(String(r.transaction_id ?? "")) === txHash)
    if (row) {
      const m = await buildMatchFromRow(row, txHash, receive, contract, latest)
      if (m) return m
    }
    fingerprint = rows.meta?.fingerprint
    if (!fingerprint) break
  }

  return null
}

/** Poll recent inbound USDT transfers (cron inbox sweep). */
export async function listRecentInboundUsdtTransfers(
  receiveAddress: string = NEXUS_TRC20_RECEIVE_ADDRESS,
  tokenContract: string = USDT_TRC20_CONTRACT,
  limit = 12,
): Promise<Trc20TransferMatch[]> {
  const receive = receiveAddress.trim()
  const contract = tokenContract.trim()
  if (!base58ToHexAddress(receive)) return []

  const rows = await fetchJson<{ data?: Trc20Row[] }>(
    `/v1/accounts/${receive}/transactions/trc20?only_confirmed=true&limit=${limit}&contract_address=${contract}`,
  )
  const latest = await getLatestBlockNumber()
  const out: Trc20TransferMatch[] = []

  for (const row of rows.data ?? []) {
    if (String(row.to ?? "") !== receive) continue
    const txHash = normalizeTxHash(String(row.transaction_id ?? ""))
    if (!isValidTronTxHash(txHash)) continue
    const m = await buildMatchFromRow(row, txHash, receive, contract, latest)
    if (m) out.push(m)
  }
  return out
}
