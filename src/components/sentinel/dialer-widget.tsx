'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Device, Call } from '@twilio/voice-sdk'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Phone, PhoneOff, PhoneIncoming } from 'lucide-react'
import { toast } from 'sonner'

export default function DialerWidget() {
  const [device, setDevice] = useState<Device | null>(null)
  const [status, setStatus] = useState('Disconnected')
  const [phoneToCall, setPhoneToCall] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [incomingCall, setIncomingCall] = useState<Call | null>(null)
  const [callerInfo, setCallerInfo] = useState<{ phone: string; leadName?: string; leadId?: string } | null>(null)
  const ringtoneRef = useRef<HTMLAudioElement | null>(null)

  // Look up caller by phone number
  const lookupCaller = useCallback(async (phone: string) => {
    try {
      const res = await fetch(`/api/dialer/v1/phone-lookup?phone=${encodeURIComponent(phone)}`)
      if (!res.ok) return { phone }
      const data = await res.json()
      if (data.leads?.length > 0) {
        const lead = data.leads[0]
        return { phone, leadName: lead.owner_name || lead.address, leadId: lead.id }
      }
      return { phone }
    } catch {
      return { phone }
    }
  }, [])

  useEffect(() => {
    const connectTwilio = async () => {
      try {
        const res = await fetch('/api/twilio/token')
        if (!res.ok) return
        const { token, callerId } = await res.json()

        const newDevice = new Device(token, {
          codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
          sounds: {
            incoming: '/sounds/ringtone.mp3',
          },
        })

        // Handle incoming calls
        newDevice.on('incoming', async (call: Call) => {
          console.log('[Dialer] Incoming call from:', call.parameters.From)
          const info = await lookupCaller(call.parameters.From || 'Unknown')
          setCallerInfo(info)
          setIncomingCall(call)
          setStatus('Incoming call...')

          // Show persistent toast notification
          toast.info(
            info.leadName
              ? `Incoming: ${info.leadName} (${info.phone})`
              : `Incoming: ${info.phone}`,
            { duration: 30000, id: 'incoming-call' }
          )

          // When the caller hangs up before we answer
          call.on('cancel', () => {
            setIncomingCall(null)
            setCallerInfo(null)
            setStatus('Missed call')
            toast.dismiss('incoming-call')
            toast.warning(`Missed call from ${info.phone}`)
          })

          call.on('disconnect', () => {
            setIncomingCall(null)
            setCallerInfo(null)
            setStatus('Call ended')
            toast.dismiss('incoming-call')
          })
        })

        // Token refresh before expiry
        newDevice.on('tokenWillExpire', async () => {
          try {
            const refreshRes = await fetch('/api/twilio/token')
            if (refreshRes.ok) {
              const { token: newToken } = await refreshRes.json()
              newDevice.updateToken(newToken)
            }
          } catch {
            console.error('[Dialer] Token refresh failed')
          }
        })

        await newDevice.register()
        setDevice(newDevice)
        setStatus('Ready -- ' + callerId)
      } catch (err) {
        console.error('[Dialer] Connection failed:', err)
        setStatus('Connection failed')
      }
    }
    connectTwilio()

    return () => {
      if (ringtoneRef.current) {
        ringtoneRef.current.pause()
      }
    }
  }, [lookupCaller])

  const answerCall = () => {
    if (!incomingCall) return
    incomingCall.accept()
    setStatus('Connected (inbound)')
    setIncomingCall(null)
    toast.dismiss('incoming-call')
  }

  const rejectCall = () => {
    if (!incomingCall) return
    incomingCall.reject()
    setIncomingCall(null)
    setCallerInfo(null)
    setStatus('Call rejected')
    toast.dismiss('incoming-call')
  }

  const makeCall = async () => {
    if (!device || !phoneToCall) return
    setConnecting(true)
    try {
      const call = await device.connect({ params: { To: phoneToCall } })
      call.on('disconnect', () => setStatus('Call ended'))
      setStatus('Calling...')
    } catch (err) {
      console.error('[Dialer] Call failed:', err)
      setStatus('Call failed')
    }
    setConnecting(false)
  }

  return (
    <Card className="glass-card p-6 bg-[#0d0d14]/85 backdrop-blur-xl border border-overlay-10 shadow-[0_12px_40px_var(--shadow-medium)]">
      <div className="text-primary text-xl font-semibold mb-4 flex items-center gap-2">
        <Phone className="h-5 w-5" /> DIALER (VoIP)
      </div>
      <div className="text-white/70 mb-4">{status}</div>

      {/* Incoming call UI */}
      {incomingCall && (
        <div className="mb-4 p-4 rounded-lg border-2 border-green-500/50 bg-green-500/10 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <PhoneIncoming className="h-5 w-5 text-green-400" />
            <span className="text-green-400 font-semibold">Incoming Call</span>
          </div>
          <div className="text-white font-medium text-lg mb-1">
            {callerInfo?.leadName || callerInfo?.phone || 'Unknown'}
          </div>
          {callerInfo?.leadName && (
            <div className="text-white/60 text-sm mb-3">{callerInfo.phone}</div>
          )}
          <div className="flex gap-2">
            <Button
              onClick={answerCall}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
            >
              <Phone className="h-4 w-4 mr-2" /> Answer
            </Button>
            <Button
              onClick={rejectCall}
              variant="destructive"
              className="flex-1 py-3"
            >
              <PhoneOff className="h-4 w-4 mr-2" /> Reject
            </Button>
          </div>
        </div>
      )}

      <Input
        type="tel"
        placeholder="+1509..."
        value={phoneToCall}
        onChange={(e) => setPhoneToCall(e.target.value)}
        className="mb-4 bg-black/50 border-overlay-10 text-white"
      />

      <Button
        onClick={makeCall}
        disabled={connecting || !device || !!incomingCall}
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-lg py-6 border border-overlay-10"
      >
        {connecting ? 'Connecting...' : 'CALL NOW'}
      </Button>

      <div className="text-sm text-overlay-40 mt-4 text-center">
        All calls use your personal Twilio number -- Auto-recorded
      </div>
    </Card>
  )
}