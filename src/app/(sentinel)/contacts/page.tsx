"use client";

import { useEffect, useState, useCallback } from "react";
import { Contact, Search, Phone, Mail, Clock, Users, PhoneCall, AtSign, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/sentinel/page-shell";
import { GlassCard } from "@/components/sentinel/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

/* ── types ────────────────────────────────────────────────────────── */

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  contact_type: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  lead_count: number;
}

const PAGE_SIZE = 25;

/* ── helpers ────────────────────────────────────────────────────────── */

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "never";
  const date = new Date(dateStr);
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

/* ── page ───────────────────────────────────────────────────────────── */

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [withPhoneCount, setWithPhoneCount] = useState(0);
  const [withEmailCount, setWithEmailCount] = useState(0);
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(0); // reset to first page on new search
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch aggregate stats (not filtered by search)
  useEffect(() => {
    async function fetchStats() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: total } = await (supabase.from("contacts") as any)
        .select("id", { count: "exact", head: true });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: withPhone } = await (supabase.from("contacts") as any)
        .select("id", { count: "exact", head: true })
        .not("phone", "is", null)
        .neq("phone", "");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: withEmail } = await (supabase.from("contacts") as any)
        .select("id", { count: "exact", head: true })
        .not("email", "is", null)
        .neq("email", "");

      setTotalCount(total ?? 0);
      setWithPhoneCount(withPhone ?? 0);
      setWithEmailCount(withEmail ?? 0);
    }
    fetchStats();
  }, []);

  // Fetch contacts with lead count, search, and pagination
  const fetchContacts = useCallback(async () => {
    setLoading(true);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Build query - fetch contacts with pagination
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase.from("contacts") as any)
      .select("id, first_name, last_name, phone, email, contact_type, notes, created_at, updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(from, to);

    // Apply search filter
    if (debouncedSearch.trim()) {
      const term = `%${debouncedSearch.trim()}%`;
      query = query.or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term}`);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("Failed to fetch contacts:", error);
      setLoading(false);
      return;
    }

    // Now fetch lead counts for the returned contacts
    const contactIds = (data || []).map((c: { id: string }) => c.id);
    let leadCounts: Record<string, number> = {};

    if (contactIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: leads } = await (supabase.from("leads") as any)
        .select("contact_id")
        .in("contact_id", contactIds);

      if (leads) {
        leadCounts = leads.reduce((acc: Record<string, number>, l: { contact_id: string }) => {
          acc[l.contact_id] = (acc[l.contact_id] || 0) + 1;
          return acc;
        }, {});
      }
    }

    const rows: ContactRow[] = (data || []).map((c: {
      id: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      email: string | null;
      contact_type: string;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }) => ({
      ...c,
      lead_count: leadCounts[c.id] || 0,
    }));

    setContacts(rows);
    if (count !== null && count !== undefined) {
      setTotalCount((prev) => debouncedSearch.trim() ? count : prev);
    }
    setLoading(false);
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const router = useRouter();

  const handleNameClick = (contact: ContactRow) => {
    const name = `${contact.first_name} ${contact.last_name}`;
    if (contact.lead_count > 0) {
      // Navigate to leads page filtered to this contact's leads
      router.push(`/leads?search=${encodeURIComponent(name)}`);
    } else {
      toast(`${name} has no associated leads yet.`);
    }
  };

  const stats = [
    { label: "Total Contacts", value: totalCount, icon: Users, color: "text-primary-400" },
    { label: "With Phone", value: withPhoneCount, icon: PhoneCall, color: "text-foreground" },
    { label: "With Email", value: withEmailCount, icon: AtSign, color: "text-foreground" },
  ];

  return (
    <PageShell
      title="Contacts"
      description="Sentinel Contacts — Unified contact database with lead association"
      actions={<></>}
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
              <p className="text-sm text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* ── Contacts Table ────────────────────────────────────────── */}
      <GlassCard hover={false}>
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Badge variant="outline" className="text-xs">{totalCount} contacts</Badge>
        </div>

        <div className="overflow-hidden rounded-[12px] border border-glass-border">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06] bg-white/[0.02]">
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Phone</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Email</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Type</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Updated</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Leads</th>
                <th className="text-left p-3 text-xs font-medium text-muted-foreground">Notes</th>
                <th className="text-right p-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                    Loading contacts...
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                    {debouncedSearch ? "No contacts match your search." : "No contacts yet."}
                  </td>
                </tr>
              ) : (
                contacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-white/[0.06] hover:bg-white/[0.04] transition-colors">
                    {/* Name */}
                    <td className="p-3">
                      <button
                        onClick={() => handleNameClick(contact)}
                        className="flex items-center gap-2 group text-left"
                      >
                        <Contact className="h-4 w-4 text-muted-foreground group-hover:text-primary-400 transition-colors" />
                        <span className="text-sm font-medium group-hover:text-primary-400 transition-colors cursor-pointer underline-offset-2 group-hover:underline">
                          {contact.first_name} {contact.last_name}
                        </span>
                      </button>
                    </td>

                    {/* Phone */}
                    <td className="p-3 text-sm text-muted-foreground">{contact.phone ?? "\u2014"}</td>

                    {/* Email */}
                    <td className="p-3 text-sm text-muted-foreground">{contact.email ?? "\u2014"}</td>

                    {/* Type */}
                    <td className="p-3">
                      <Badge variant="outline" className="text-sm">{contact.contact_type}</Badge>
                    </td>

                    {/* Updated — relative time */}
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {relativeTime(contact.updated_at)}
                      </span>
                    </td>

                    {/* Leads */}
                    <td className="p-3 text-sm">{contact.lead_count}</td>

                    {/* Notes */}
                    <td className="p-3" title={contact.notes ?? undefined}>
                      <span className="text-xs text-muted-foreground italic">
                        {truncate(contact.notes)}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="p-3">
                      <div className="flex items-center justify-end gap-1">
                        {contact.phone && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Copy phone number"
                            onClick={() => { navigator.clipboard.writeText(contact.phone!); toast.success("Phone number copied to clipboard"); }}>
                            <Phone className="h-3 w-3" />
                          </Button>
                        )}
                        {contact.email && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Send email" asChild>
                            <a href={`mailto:${contact.email}`}><Mail className="h-3 w-3" /></a>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ─────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 px-1">
            <p className="text-xs text-muted-foreground">
              Page {page + 1} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-3 w-3" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        {/* TODO: Contact merge/dedup */}
        {/* TODO: Skip tracing integration */}
      </GlassCard>
    </PageShell>
  );
}
