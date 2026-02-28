"use client";

import { Contact, Search, Plus, Download, Upload, Phone, Mail } from "lucide-react";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const contacts = [
  { name: "Margaret Henderson", phone: "(602) 555-0142", email: "m.henderson@email.com", type: "Owner", leads: 2 },
  { name: "Robert Chen", phone: "(480) 555-0198", email: "r.chen@email.com", type: "Owner", leads: 1 },
  { name: "Lisa Morales", phone: "(602) 555-0267", email: null, type: "Owner", leads: 1 },
  { name: "James Walker", phone: "(480) 555-0334", email: "j.walker@email.com", type: "Owner", leads: 3 },
  { name: "Jennifer Torres", phone: "(623) 555-0401", email: "j.torres@email.com", type: "Agent", leads: 0 },
];

export default function ContactsPage() {
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
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Leads</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.name} className="border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Contact className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{contact.name}</span>
                    </div>
                  </td>
                  <td className="p-3 text-sm text-muted-foreground">{contact.phone}</td>
                  <td className="p-3 text-sm text-muted-foreground">{contact.email ?? "—"}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="text-[10px]">{contact.type}</Badge>
                  </td>
                  <td className="p-3 text-sm">{contact.leads}</td>
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
