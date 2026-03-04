'use client'
import { useState, useEffect } from 'react'
import { Device, Call } from '@twilio/voice-sdk'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'

export default function DialerWidget() {
  const [device, setDevice] = useState<any>(null)
  const [status, setStatus] = useState('Disconnected')
  const [phoneToCall, setPhoneToCall] = useState('')
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    const connectTwilio = async () => {
      const res = await fetch('/api/twilio/token')
      const { token, callerId } = await res.json()
      
      const newDevice = new Device(token, { codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU] })
      await newDevice.register()
      setDevice(newDevice)
      setStatus('Ready — ' + callerId)
    }
    connectTwilio()
  }, [])

  const makeCall = async () => {
    if (!device || !phoneToCall) return
    setConnecting(true)
    const call = await device.connect({ To: phoneToCall })
    call.on('disconnect', () => setStatus('Call ended'))
    setConnecting(false)
  }

  return (
    <Card className="glass-card p-6 bg-[#0d0d14]/85 backdrop-blur-xl border border-white/6 shadow-[0_0_8px_#00ff88]">
      <div className="text-[#00ff88] text-xl font-bold mb-4 flex items-center gap-2">
        📞 DIALER (VoIP Only)
      </div>
      <div className="text-white/70 mb-4">{status}</div>
      
      <Input
        type="tel"
        placeholder="+1509..."
        value={phoneToCall}
        onChange={(e) => setPhoneToCall(e.target.value)}
        className="mb-4 bg-black/50 border-white/10 text-white"
      />
      
      <Button 
        onClick={makeCall} 
        disabled={connecting || !device}
        className="w-full bg-[#00ff88] hover:bg-[#00ff88]/90 text-black font-bold text-lg py-6 neon-glow"
      >
        {connecting ? 'Connecting...' : 'CALL NOW'}
      </Button>
      
      <div className="text-[10px] text-white/40 mt-4 text-center">
        All calls use your personal Twilio number • Auto-recorded
      </div>
    </Card>
  )
}