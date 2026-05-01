'use client'
import { useState, useRef, useEffect } from 'react'

interface CommandCenterProps {
  onCommand: (command: string) => Promise<any>
}

export default function CommandCenter({ onCommand }: CommandCenterProps) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<Array<{ type: 'user' | 'bot', text: string, timestamp: Date }>>([
    { type: 'bot', text: 'W-BRAIN ONLINE. Type a command, e.g., "start Liquidity Warfare on BTC with 1.5% risk"', timestamp: new Date() }
  ])
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [isLoading, setIsLoading] = useState(false)
  const terminalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [history])

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return

    const userCommand = input.trim()
    setHistory(prev => [...prev, { type: 'user', text: `> ${userCommand}`, timestamp: new Date() }])
    setCommandHistory(prev => [...prev, userCommand])
    setHistoryIndex(-1)
    setInput('')
    setIsLoading(true)

    try {
      const response = await onCommand(userCommand)
      const botResponse = response.message || (response.success ? 'Command executed successfully.' : 'Command failed.')
      setHistory(prev => [...prev, { 
        type: 'bot', 
        text: `[W-BRAIN] ${botResponse}${response.botId ? `\n[ROUTED TO: ${response.botId}]` : ''}`,
        timestamp: new Date()
      }])
    } catch (error) {
      setHistory(prev => [...prev, { type: 'bot', text: '[ERROR] Failed to execute command.', timestamp: new Date() }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length > 0) {
        const newIndex = historyIndex + 1
        if (newIndex < commandHistory.length) {
          setHistoryIndex(newIndex)
          setInput(commandHistory[commandHistory.length - 1 - newIndex])
        }
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setInput(commandHistory[commandHistory.length - 1 - newIndex])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setInput('')
      }
    }
  }

  return (
    <div style={{ backgroundColor: '#0A0B0E', border: '1px solid #00E5FF', borderRadius: '8px', overflow: 'hidden' }}>
      <div style={{ 
        backgroundColor: '#00E5FF', 
        padding: '8px 16px', 
        fontFamily: "'Space Mono', monospace", 
        fontSize: '12px', 
        fontWeight: 'bold', 
        color: '#0A0B0E'
      }}>
        W-BRAIN COMMAND INTERFACE — DeepSeek Orchestrator ▼ ACTIVE
      </div>
      
      <div ref={terminalRef} style={{ height: '300px', overflowY: 'auto', padding: '16px', fontFamily: "'Space Mono', monospace", fontSize: '13px' }}>
        {history.map((entry, idx) => (
          <div key={idx} style={{ marginBottom: '8px', color: entry.type === 'user' ? '#00E5FF' : '#F0F2F5' }}>
            {entry.text}
            <span style={{ fontSize: '10px', color: '#8B92A5', marginLeft: '8px' }}>
              {entry.timestamp.toLocaleTimeString()}
            </span>
          </div>
        ))}
        {isLoading && (
          <div style={{ color: '#00E5FF' }}>
            {'>'} Processing... <span style={{ animation: 'pulse 1s infinite' }}>_</span>
          </div>
        )}
      </div>
      
      <div style={{ display: 'flex', borderTop: '1px solid #1E2028' }}>
        <span style={{ padding: '12px 16px', color: '#00E5FF', fontFamily: "'Space Mono', monospace" }}>$</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter command... (↑ history)"
          disabled={isLoading}
          style={{
            flex: 1,
            backgroundColor: 'transparent',
            border: 'none',
            padding: '12px 16px 12px 0',
            color: '#F0F2F5',
            fontFamily: "'Space Mono', monospace",
            fontSize: '13px',
            outline: 'none'
          }}
        />
      </div>
    </div>
  )
}
