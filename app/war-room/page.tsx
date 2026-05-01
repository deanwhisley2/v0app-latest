"use client"

/**
 * WAR ROOM - Market Intelligence Weapon System
 * 
 * The command center for liquidity warfare operations.
 * Connected to REAL market data via Binance API and Gold API.
 * 
 * Route: /war-room
 */

import { WarRoom } from "@/components/dashboard/war-room"

export default function WarRoomPage() {
  return (
    <div className="min-h-screen bg-black">
      <WarRoom />
    </div>
  )
}
