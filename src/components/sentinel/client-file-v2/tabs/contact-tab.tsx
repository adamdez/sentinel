"use client";

import { Phone, Mail, User } from "lucide-react";

interface ContactTabProps {
  ownerName: string;
  ownerPhone: string | null;
  ownerEmail: string | null;
  onDial: (phone: string) => void;
  onSms: (phone: string) => void;
}

export function ContactTab({ ownerName, ownerPhone, ownerEmail, onDial, onSms }: ContactTabProps) {
  return (
    <div className="space-y-6 max-w-2xl mx-auto mt-6">
      <div className="bg-overlay-5 border border-overlay-10 rounded-xl p-6 flex flex-col items-center justify-center text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary-500/20 text-primary-400 flex items-center justify-center mb-2">
          <User className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold">{ownerName}</h2>
        
        <div className="flex gap-4 w-full mt-4">
          <div className="flex-1 bg-black/20 p-4 rounded-lg border border-overlay-5">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold flex items-center justify-center gap-1.5 mb-2">
               <Phone className="w-3 h-3" /> Primary Phone
            </p>
            <p className="font-mono text-lg">{ownerPhone || "No Phone on File"}</p>
            
            {ownerPhone && (
              <div className="grid grid-cols-2 gap-2 mt-4">
                <button 
                  onClick={() => onDial(ownerPhone)}
                  className="bg-muted/20 text-foreground hover:bg-muted/30 border border-border/30 py-2 rounded font-medium transition-colors"
                >
                  Call
                </button>
                <button 
                  onClick={() => onSms(ownerPhone)}
                  className="bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 border border-primary-500/30 py-2 rounded font-medium transition-colors"
                >
                  Text
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 bg-black/20 p-4 rounded-lg border border-overlay-5">
            <p className="text-xs text-muted-foreground uppercase tracking-widest font-semibold flex items-center justify-center gap-1.5 mb-2">
               <Mail className="w-3 h-3" /> Primary Email
            </p>
            <p className="font-mono text-sm break-all">{ownerEmail || "No Email on File"}</p>
            
            {ownerEmail && (
              <button 
                className="w-full mt-4 bg-overlay-5 text-foreground hover:bg-overlay-10 border border-overlay-10 py-2 rounded font-medium transition-colors"
              >
                Send Email
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
