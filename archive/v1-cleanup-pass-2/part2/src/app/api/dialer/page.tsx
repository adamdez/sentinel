'use client'
import DialerWidget from '@/components/sentinel/dialer-widget'

export default function DialerPage() {
  return (
    <div className="min-h-screen bg-[#07070d] p-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-[#00ff88] text-4xl font-bold mb-2 flex items-center gap-3">
          📞 DOMINION DIALER — VOIP ONLY
        </div>
        <div className="text-white/60 mb-8">Your personal 509 or 208 number • Browser only</div>
        
        <DialerWidget />
      </div>
    </div>
  )
}