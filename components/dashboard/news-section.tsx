"use client"

import { Card } from "@/components/ui/card"
import { ExternalLink, Clock } from "lucide-react"

interface NewsItem {
  id: string
  title: string
  source: string
  time: string
  tag: string
}

const newsData: NewsItem[] = [
  {
    id: "1",
    title: "Bitcoin ETF sees record inflows as institutional demand surges",
    source: "CoinDesk",
    time: "2h ago",
    tag: "BTC",
  },
  {
    id: "2",
    title: "Ethereum upgrade expected to reduce gas fees by 40%",
    source: "The Block",
    time: "4h ago",
    tag: "ETH",
  },
  {
    id: "3",
    title: "Solana DeFi TVL reaches new all-time high of $12B",
    source: "DeFi Llama",
    time: "6h ago",
    tag: "SOL",
  },
  {
    id: "4",
    title: "Major exchange announces support for 20 new altcoins",
    source: "CryptoNews",
    time: "8h ago",
    tag: "MARKET",
  },
]

export function NewsSection() {
  return (
    <Card className="border-border bg-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Latest News</h3>
        <button className="text-xs text-primary hover:underline">View All</button>
      </div>

      <div className="space-y-3">
        {newsData.map((news) => (
          <div
            key={news.id}
            className="group cursor-pointer rounded-lg border border-border/50 bg-muted/20 p-3 transition-all hover:border-primary/30 hover:bg-muted/40"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h4 className="text-sm font-medium leading-snug group-hover:text-primary">
                {news.title}
              </h4>
              <ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{news.source}</span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {news.time}
              </span>
              <span className="rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
                {news.tag}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
