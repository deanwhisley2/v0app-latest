const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "app", "trading-workspace", "page.tsx");
let content = fs.readFileSync(filePath, "utf8");

// Check if export default already exists
if (content.includes("export default function TradingWorkspacePage")) {
  console.log("Export already exists, skipping");
  process.exit(0);
}

// Append the main page component
const component = `

// ============================================================
// MAIN PAGE COMPONENT
// ============================================================
export default function TradingWorkspacePage() {
  const router = useRouter()
  const [layout, setLayout] = useState("single")
  const [charts, setCharts] = useState([{
    id: "chart-1", symbol: "BTCUSDT", timeframe: "5m", chartStyle: "candlestick",
    indicators: [
      { type: "ma", enabled: false, maPeriods: [20, 50], color: "#3b82f6" },
      { type: "ema", enabled: false, maPeriods: [9], color: "#f97316" },
      { type: "bollinger", enabled: false, bbPeriod: 20, bbStdDev: 2, color: "#a855f7" },
      { type: "rsi", enabled: false, rsiPeriod: 14, color: "#a855f7" },
      { type: "macd", enabled: false, macdFast: 12, macdSlow: 26, macdSignal: 9 },
      { type: "volume", enabled: true },
    ],
    drawings: [],
    candleColors: { bullish: "#22c55e", bearish: "#ef4444", wickColor: "#666", showWicks: true, showBorders: true, borderThickness: 1 },
    volumeEnabled: true,
  }])
  const [candlesMap, setCandlesMap] = useState({})
  const [teachMode, setTeachMode] = useState(false)
  const [activeDrawingTool, setActiveDrawingTool] = useState(null)
  const [drawingColor, setDrawingColor] = useState("red")
  const [drawingThickness, setDrawingThickness] = useState(2)
  const [preferences, setPreferences] = useState({
    showGrid: true, showCrosshair: true, showVolume: true, showIndicators: true,
    chartStyle: "candlestick", theme: "dark", soundEnabled: false, notificationsEnabled: true,
  })
  const [patternAlerts, setPatternAlerts] = useState([])
  const [showSettings, setShowSettings] = useState(false)
  const [showAssetSearch, setShowAssetSearch] = useState(false)
  const [assetSearch, setAssetSearch] = useState("")
  const [assets, setAssets] = useState([
    { symbol: "BTCUSDT", name: "Bitcoin", price: 0, change: 0 },
    { symbol: "ETHUSDT", name: "Ethereum", price: 0, change: 0 },
    { symbol: "SOLUSDT", name: "Solana", price: 0, change: 0 },
    { symbol: "BNBUSDT", name: "BNB", price: 0, change: 0 },
    { symbol: "XRPUSDT", name: "Ripple", price: 0, change: 0 },
  ])
  const [currentPrice, setCurrentPrice] = useState(0)
  const [priceChange, setPriceChange] = useState(0)
  const [priceChangePercent, setPriceChangePercent] = useState(0)
  const [highPrice, setHighPrice] = useState(0)
  const [lowPrice, setLowPrice] = useState(0)
  const [volume, setVolume] = useState(0)
  const [isLive, setIsLive] = useState(true)
  const [lastUpdate, setLastUpdate] = useState(new Date())
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [activeRightTab, setActiveRightTab] = useState("orders")
  const [fullscreen, setFullscreen] = useState(false)
  const chartContainerRef = useRef(null)
  const [chartSize, setChartSize] = useState({ width: 800, height: 500 })
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] })
  const [showOrderBook, setShowOrderBook] = useState(true)
  const [showTradePanel, setShowTradePanel] = useState(true)
  const [showWatchlist, setShowWatchlist] = useState(true)
  const [showToolbar, setShowToolbar] = useState(true)
  const [showStatusBar, setShowStatusBar] = useState(true)
  const [theme, setTheme] = useState("dark")

  // Fetch market data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [priceRes, klinesRes, depthRes, tickerRes] = await Promise.all([
          fetch("/api/binance?endpoint=/api/v3/ticker/price&symbol=BTCUSDT"),
          fetch("/api/binance?endpoint=/api/v3/klines&symbol=BTCUSDT&interval=1m&limit=100"),
          fetch("/api/binance?endpoint=/api/v3/depth&symbol=BTCUSDT&limit=50"),
          fetch("/api/binance?endpoint=/api/v3/ticker/24hr&symbol=BTCUSDT"),
        ])
        const priceData = await priceRes.json()
        const klinesData = await klinesRes.json()
        const depthData = await depthRes.json()
        const tickerData = await tickerRes.json()

        setCurrentPrice(parseFloat(priceData.price))
        setPriceChange(parseFloat(tickerData.priceChange))
        setPriceChangePercent(parseFloat(tickerData.priceChangePercent))
        setHighPrice(parseFloat(tickerData.highPrice))
        setLowPrice(parseFloat(tickerData.lowPrice))
        setVolume(parseFloat(tickerData.volume))

        const candles = klinesData.map(k => ({
          time: k[0] / 1000,
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }))
        setCandlesMap({ "chart-1": candles })

        const bids = depthData.bids.slice(0, 20).map(b => [b[0], b[1]])
        const asks = depthData.asks.slice(0, 20).map(a => [a[0], a[1]])
        setOrderBook({ bids, asks })
        setLastUpdate(new Date())
      } catch (err) {
        console.error("Failed to fetch market data:", err)
      }
    }
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [])

  // Update asset prices
  useEffect(() => {
    const updateAssets = async () => {
      try {
        const symbols = assets.map(a => a.symbol).join(",")
        const res = await fetch("/api/binance?endpoint=/api/v3/ticker/24hr&symbols=" + encodeURIComponent("[" + symbols.split(",").map(s => '"' + s + '"').join(",") + "]"))
        const data = await res.json()
        if (Array.isArray(data)) {
          setAssets(prev => prev.map(a => {
            const ticker = data.find(t => t.symbol === a.symbol)
            return ticker ? { ...a, price: parseFloat(ticker.lastPrice), change: parseFloat(ticker.priceChangePercent) } : a
          }))
        }
      } catch (err) {
        console.error("Failed to update assets:", err)
      }
    }
    updateAssets()
  }, [])

  // Resize observer
  useEffect(() => {
    if (!chartContainerRef.current) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setChartSize({ width: Math.floor(width), height: Math.floor(height) })
      }
    })
    observer.observe(chartContainerRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-emerald-400">NEX</span>
            <span className="text-xs text-zinc-500">Trading Workspace</span>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-1">
            <Badge variant={isLive ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
              {isLive ? "● LIVE" : "PAUSED"}
            </Badge>
            <span className="text-xs text-zinc-500">{lastUpdate.toLocaleTimeString()}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowToolbar(!showToolbar)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowRightPanel(!showRightPanel)}>
            {showRightPanel ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFullscreen(!fullscreen)}>
            {fullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowSettings(true)}>
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chart Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          {showToolbar && (
            <div className="flex items-center gap-1 px-2 py-1 border-b border-zinc-800 bg-zinc-900/30 shrink-0 overflow-x-auto">
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={() => setShowAssetSearch(true)}>
                <Search className="h-3 w-3 mr-1" /> BTCUSDT
              </Button>
              <Separator orientation="vertical" className="h-4" />
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">1m</Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 bg-zinc-800">5m</Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">15m</Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">1h</Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">4h</Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">1d</Button>
              <Separator orientation="vertical" className="h-4" />
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                <CandlestickChart className="h-3 w-3 mr-1" /> Candle
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                <LineChart className="h-3 w-3 mr-1" /> Line
              </Button>
              <Separator orientation="vertical" className="h-4" />
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                <Activity className="h-3 w-3 mr-1" /> Indicators
              </Button>
              <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2">
                <Pencil className="h-3 w-3 mr-1" /> Draw
              </Button>
              <Button variant="ghost" size="sm" className={"h-6 text-[10px] px-2 " + (teachMode ? "bg-yellow-500/20 text-yellow-400" : "")} onClick={() => setTeachMode(!teachMode)}>
                <Lightbulb className="h-3 w-3 mr-1" /> Teach
              </Button>
            </div>
          )}

          {/* Chart */}
          <div ref={chartContainerRef} className="flex-1 relative">
            {candlesMap["chart-1"] && candlesMap["chart-1"].length > 0 ? (
              <ChartComponent
                candles={candlesMap["chart-1"]}
                width={chartSize.width}
                height={chartSize.height}
                teachMode={teachMode}
                activeDrawingTool={activeDrawingTool}
                drawingColor={drawingColor}
                drawingThickness={drawingThickness}
                drawings={charts[0]?.drawings || []}
                setDrawings={(drawings) => setCharts(prev => prev.map((c, i) => i === 0 ? { ...c, drawings } : c))}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-600">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                Loading chart data...
              </div>
            )}
          </div>

          {/* Status Bar */}
          {showStatusBar && (
            <div className="flex items-center justify-between px-3 py-1 border-t border-zinc-800 bg-zinc-900/30 shrink-0">
              <div className="flex items-center gap-4 text-[10px] text-zinc-500">
                <span>O: {candlesMap["chart-1"]?.[candlesMap["chart-1"]?.length - 1]?.open?.toFixed(2) || "--"}</span>
                <span>H: {candlesMap["chart-1"]?.[candlesMap["chart-1"]?.length - 1]?.high?.toFixed(2) || "--"}</span>
                <span>L: {candlesMap["chart-1"]?.[candlesMap["chart-1"]?.length - 1]?.low?.toFixed(2) || "--"}</span>
                <span>C: {candlesMap["chart-1"]?.[candlesMap["chart-1"]?.length - 1]?.close?.toFixed(2) || "--"}</span>
                <span>Vol: {volume?.toFixed(2) || "--"}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                <span>24h H: {highPrice?.toFixed(2)}</span>
                <span>24h L: {lowPrice?.toFixed(2)}</span>
                <span className={priceChange >= 0 ? "text-green-400" : "text-red-400"}>
                  {priceChangePercent?.toFixed(2)}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel */}
        {showRightPanel && (
          <div className="w-72 border-l border-zinc-800 bg-zinc-900/30 flex flex-col shrink-0">
            <Tabs value={activeRightTab} onValueChange={setActiveRightTab} className="flex flex-col h-full">
              <TabsList className="grid grid-cols-3 mx-2 mt-2 h-7">
                <TabsTrigger value="orders" className="text-[10px] py-0">Orders</TabsTrigger>
                <TabsTrigger value="book" className="text-[10px] py-0">Book</TabsTrigger>
                <TabsTrigger value="info" className="text-[10px] py-0">Info</TabsTrigger>
              </TabsList>

              <TabsContent value="orders" className="flex-1 p-2 overflow-auto">
                <div className="text-[10px] text-zinc-500 mb-2">Place Order</div>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 h-7 text-[10px] bg-green-500/20 text-green-400 hover:bg-green-500/30">Buy</Button>
                    <Button size="sm" className="flex-1 h-7 text-[10px] bg-red-500/20 text-red-400 hover:bg-red-500/30">Sell</Button>
                  </div>
                  <div>
                    <Label className="text-[10px] text-zinc-500">Price</Label>
                    <Input className="h-7 text-xs" placeholder={currentPrice?.toFixed(2)} />
                  </div>
                  <div>
                    <Label className="text-[10px] text-zinc-500">Amount</Label>
                    <Input className="h-7 text-xs" placeholder="0.001" />
                  </div>
                  <Button size="sm" className="w-full h-7 text-[10px]">Place Order</Button>
                </div>
              </TabsContent>

              <TabsContent value="book" className="flex-1 p-2 overflow-auto">
                <div className="text-[10px] text-zinc-500 mb-2">Order Book</div>
                <div className="space-y-0.5">
                  {orderBook.asks?.slice(0, 10).reverse().map((ask, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-red-400">{parseFloat(ask[0]).toFixed(2)}</span>
                      <span className="text-zinc-400">{parseFloat(ask[1]).toFixed(4)}</span>
                    </div>
                  ))}
                  <div className="border-t border-b border-zinc-700 py-1 my-1">
                    <div className="flex justify-between text-xs font-bold">
                      <span className="text-green-400">{currentPrice?.toFixed(2)}</span>
                    </div>
                  </div>
                  {orderBook.bids?.slice(0, 10).map((bid, i) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-green-400">{parseFloat(bid[0]).toFixed(2)}</span>
                      <span className="text-zinc-400">{parseFloat(bid[1]).toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="info" className="flex-1 p-2 overflow-auto">
                <div className="text-[10px] text-zinc-500 mb-2">Market Info</div>
                <div className="space-y-1 text-[10px]">
                  <div className="flex justify-between"><span className="text-zinc-500">24h Volume</span><span>{volume?.toFixed(2)} BTC</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">24h High</span><span className="text-green-400">{highPrice?.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">24h Low</span><span className="text-red-400">{lowPrice?.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-500">Change</span><span className={priceChange >= 0 ? "text-green-400" : "text-red-400"}>{priceChangePercent?.toFixed(2)}%</span></div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  )
}
`;

fs.writeFileSync(filePath, content + component, "utf8");
console.log("Successfully appended TradingWorkspacePage component");
