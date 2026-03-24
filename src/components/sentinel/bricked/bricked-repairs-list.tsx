"use client";

import { forwardRef, useState, useCallback } from "react";
import { ChevronDown, ChevronRight, Wrench, Plus, Trash2, Save } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { BrickedRepair } from "@/providers/bricked/adapter";

export interface EditableRepair {
  repair: string;
  description?: string;
  cost: number;
}

interface Props {
  repairs: BrickedRepair[];
  totalRepairCost: number | null | undefined;
  onRepairsChange?: (repairs: EditableRepair[], total: number) => void;
  onSave?: (repairs: EditableRepair[]) => void;
  initialEdited?: EditableRepair[] | null;
}

function toEditable(repairs: BrickedRepair[]): EditableRepair[] {
  return repairs.map((r) => ({
    repair: r.repair ?? "Item",
    description: r.description,
    cost: r.cost ?? 0,
  }));
}

export const BrickedRepairsList = forwardRef<HTMLDivElement, Props>(
  function BrickedRepairsList({ repairs, totalRepairCost, onRepairsChange, onSave, initialEdited }, ref) {
    const [open, setOpen] = useState(true);
    const [items, setItems] = useState<EditableRepair[]>(
      () => initialEdited?.length ? initialEdited : toEditable(repairs),
    );
    const [editIdx, setEditIdx] = useState<number | null>(null);
    const [editValue, setEditValue] = useState("");
    const [newName, setNewName] = useState("");
    const [newCost, setNewCost] = useState("");
    const [dirty, setDirty] = useState(false);

    const total = items.reduce((s, r) => s + r.cost, 0);

    const notify = useCallback((updated: EditableRepair[]) => {
      const t = updated.reduce((s, r) => s + r.cost, 0);
      onRepairsChange?.(updated, t);
    }, [onRepairsChange]);

    const startEdit = (idx: number) => {
      setEditIdx(idx);
      setEditValue(String(items[idx].cost));
    };

    const commitEdit = () => {
      if (editIdx == null) return;
      const updated = [...items];
      updated[editIdx] = { ...updated[editIdx], cost: Number(editValue) || 0 };
      setItems(updated);
      setEditIdx(null);
      setDirty(true);
      notify(updated);
    };

    const cancelEdit = () => setEditIdx(null);

    const deleteItem = (idx: number) => {
      const updated = items.filter((_, i) => i !== idx);
      setItems(updated);
      setDirty(true);
      notify(updated);
    };

    const addItem = () => {
      if (!newName.trim()) return;
      const updated = [...items, { repair: newName.trim(), cost: Number(newCost) || 0 }];
      setItems(updated);
      setNewName("");
      setNewCost("");
      setDirty(true);
      notify(updated);
    };

    const displayTotal = dirty ? total : (totalRepairCost ?? total);

    return (
      <div ref={ref} className="rounded-[10px] border border-overlay-6 bg-panel overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-overlay-2 transition-colors"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          <Wrench className="h-3.5 w-3.5 text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Repair Estimates
          </span>
          <span className="ml-auto text-sm font-bold font-mono text-amber-300">
            {formatCurrency(displayTotal)}
          </span>
        </button>
        {open && (
          <div className="divide-y divide-overlay-4">
            {items.map((r, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 group">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{r.repair}</p>
                  {r.description && (
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{r.description}</p>
                  )}
                </div>
                {editIdx === i ? (
                  <input
                    type="number"
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    onBlur={commitEdit}
                    className="w-24 px-2 py-1 rounded border border-overlay-8 bg-overlay-3 text-xs font-mono text-foreground text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(i)}
                    className="text-xs font-bold font-mono shrink-0 hover:text-cyan transition-colors cursor-text"
                    title="Click to edit"
                  >
                    {formatCurrency(r.cost)}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => deleteItem(i)}
                  className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity"
                  title="Remove"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}

            {/* Add new repair */}
            <div className="flex items-center gap-2 px-4 py-2.5">
              <input
                type="text"
                placeholder="Repair name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addItem()}
                className="flex-1 px-2 py-1.5 rounded border border-overlay-8 bg-overlay-3 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <input
                type="number"
                placeholder="Cost"
                value={newCost}
                onChange={(e) => setNewCost(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addItem()}
                className="w-24 px-2 py-1.5 rounded border border-overlay-8 bg-overlay-3 text-xs font-mono text-foreground placeholder:text-muted-foreground/40 text-right focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              <button
                type="button"
                onClick={addItem}
                disabled={!newName.trim()}
                className={cn(
                  "h-7 w-7 flex items-center justify-center rounded border transition-colors",
                  newName.trim()
                    ? "border-cyan/30 text-cyan hover:bg-cyan/10"
                    : "border-overlay-6 text-muted-foreground/30 cursor-not-allowed"
                )}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Total + save */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-overlay-2">
              <span className="text-xs font-semibold text-muted-foreground">Total</span>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold font-mono">{formatCurrency(displayTotal)}</span>
                {dirty && onSave && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 gap-1 text-[10px]"
                    onClick={() => {
                      onSave(items);
                      setDirty(false);
                    }}
                  >
                    <Save className="h-3 w-3" />
                    Save
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  },
);
