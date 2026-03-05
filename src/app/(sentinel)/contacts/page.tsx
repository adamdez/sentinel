"use client";

import { Contact, Search, Plus, Download, Upload, Phone, Mail, Clock, FileText, Users, PhoneCall, AtSign } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

/* ── mock contact data ─────────────────────────────────────────────── */

const contacts = [
  {
    name: "Margaret Henderson",
    phone: "(602) 555-0142",
    email: "m.henderson@email.com",
    type: "Owner",
    leads: 2,
    lastContact: new Date(Date.now() - 2 * 86_400_000),           // 2 days ago
    notes: "Motivated seller, prefers text over calls. Vacant lot on 7th Ave.",
  },
  {
    name: "Robert Chen",
    phone: "(480) 555-0198",
    email: "r.chen@email.com",
    type: "Owner",
    leads: 1,
    lastContact: new Date(Date.now() - 14 * 86_400_000),          // 14 days ago
    notes: "Inherited property, waiting on probate.",
  },
  {
    name: "Lisa Morales",
    phone: "(602) 555-0267",
    email: null,
    type: "Owner",
    leads: 1,
    lastContact: null,
    notes: null,
  },
  {
    name: "James Walker",
    phone: "(480) 555-0334",
    email: "j.walker@email.com",
    type: "Owner",
    leads: 3,
    lastContact: new Date(Date.now() - 0.5 * 86_400_000),         // ~12 hours ago
    notes: "Wants $180k, ARV est ~$260k. Follow up Friday.",
  },
  {
    name: "Jennifer Torres",
    phone: "(623) 555-0401",
    email: "j.torres@email.com",
    type: "Agent",
    leads: 0,
    lastContact: new Date(Date.now() - 45 * 86_400_000),          // 45 days ago
    notes: "Buyer's agent, sent comps last month.",
  },
];

/* ── helpers ────────────────────────────────────────────────────────── */

function relativeTime(date: Date | null): string {
  if (!date) return "never";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  const diffMo = Math.floor(diffD / 30);
  return `${diffMo}mo ago`;
}

function truncate(text: string | null, max = 30): string {
  if (!text) return "\u2014";
  return text.length > max ? text.slice(0, max) + "\u2026" : text;
}

/* ── quick stats ────────────────────────────────────────────────────── */

const totalContacts = contacts.length;
const withPhone = contacts.filter((c) => c.phone).length;
const withEmail = contacts.filter((c) => c.email).length;

const stats = [
  { label: "Total Contacts", value: totalContacts, icon: Users, color: "text-cyan-400" },
  { label: "With Phone",     value: withPhone,      icon: PhoneCall, color: "text-emerald-400" },
  { label: "With Email",     value: withEmail,       icon: AtSign,    color: "text-violet-400" },
];

/* ── page ───────────────────────────────────────────────────────────── */

export default function ContactsPage() {
  const handleNameClick = (contact: (typeof contacts)[number]) => {
    if (contact.leads > 0) {
      toast(`${contact.name} has ${contact.leads} lead${contact.leads > 1 ? "s" : ""} in the pipeline`, {
        description: "Navigate to Prospects to view associated leads.",
      });
    } else {
      toast(`${contact.name} has no associated leads yet.`);
    }
  };

  return (
    <PageShell
      title="Contacts"
      description="Sentinel Contacts — Unified contact database with lead association"
      actions={
        <>
          <Button variant="outline" size="sm" className="gap-2 text-xs">
            <Upload className="h-3 w-3" />
            Import
          </Button>
          <Button variant="outline" size="sm" className="gap-2 text-xs">
            <Download className="h-3 w-3" />
            Export
          </Button>
          <Button size="sm" className="gap-2 text-xs">
            <Plus className="h-3 w-3" />
            Add Contact
          </Button>
        </>
      }
    >
      {/* ── Quick Stats Row ───────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {stats.map((s) => (
          <GlassCard key={s.label} hover={false} className="!p-3 flex items-center gap-3">
            <div className={`rounded-lg bg-white/[0.04] p-2 ${s.color}`}>
              <s.icon className="h-4 w-4" />
            </div>
            <div>
              <p className="text-lg font-semibold leading-none">{s.value}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* ── Contacts Table ────────────────────────────────────────── */}
      <GlassCard hover={false}>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search contacts..." className="pl-9" />
          </div>
          <Badge variant="outline" className="text-xs">{contacts.length} contacts</Badge>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-glass-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Phone</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Email</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Last Contact</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Leads</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Notes</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.name} className="border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors">
                  {/* Name — clickable */}
                  <td className="p-3">
                    <button
                      onClick={() => handleNameClick(contact)}
                      className="flex items-center gap-2 group text-left"
                    >
                      <Contact className="h-4 w-4 text-muted-foreground group-hover:text-cyan-400 transition-colors" />
                      <span className="text-sm font-medium group-hover:text-cyan-400 transition-colors cursor-pointer underline-offset-2 group-hover:underline">
                        {contact.name}
                      </span>
                    </button>
                  </td>

                  {/* Phone */}
                  <td className="p-3 text-sm text-muted-foreground">{contact.phone}</td>

                  {/* Email */}
                  <td className="p-3 text-sm text-muted-foreground">{contact.email ?? "\u2014"}</td>

                  {/* Type */}
                  <td className="p-3">
                    <Badge variant="outline" className="text-[10px]">{contact.type}</Badge>
                  </td>

                  {/* Last Contact — relative time */}
                  <td className="p-3">
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {relativeTime(contact.lastContact)}
                    </span>
                  </td>

                  {/* Leads */}
                  <td className="p-3 text-sm">{contact.leads}</td>

                  {/* Notes — truncated preview */}
                  <td className="p-3" title={contact.notes ?? undefined}>
                    <span className="text-xs text-muted-foreground italic">
                      {truncate(contact.notes)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Phone className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Mail className="h-3 w-3" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* TODO: Paginated contact list with APN + county identity model */}
        {/* TODO: Contact merge/dedup */}
        {/* TODO: Skip tracing integration */}
      </GlassCard>
    </PageShell>
  );
}
