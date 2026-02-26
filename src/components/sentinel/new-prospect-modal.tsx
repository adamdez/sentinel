"use client";

import { motion } from "framer-motion";
import { UserPlus, MapPin, Phone, Mail, FileText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useModal } from "@/providers/modal-provider";

const distressTypes = [
  "Probate", "Pre-Foreclosure", "Tax Lien", "Code Violation",
  "Vacant", "Divorce", "Bankruptcy", "FSBO", "Absentee", "Inherited",
];

export function NewProspectModal() {
  const { activeModal, closeModal } = useModal();

  return (
    <Dialog open={activeModal === "new-prospect"} onOpenChange={closeModal}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-neon" />
            New Prospect
          </DialogTitle>
          <DialogDescription>
            Add a new property prospect to the pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Owner Name
              </label>
              <div className="relative">
                <Input placeholder="Full name" className="pl-8" />
                <UserPlus className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Phone
              </label>
              <div className="relative">
                <Input placeholder="(555) 000-0000" className="pl-8" />
                <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Property Address
            </label>
            <div className="relative">
              <Input placeholder="123 Main St, City, State ZIP" className="pl-8" />
              <MapPin className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                APN
              </label>
              <div className="relative">
                <Input placeholder="000-00-000" className="pl-8" />
                <FileText className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                County
              </label>
              <Input placeholder="Maricopa" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Email (optional)
            </label>
            <div className="relative">
              <Input placeholder="owner@email.com" className="pl-8" />
              <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Distress Type
            </label>
            <div className="flex flex-wrap gap-1.5">
              {distressTypes.map((type) => (
                <motion.button
                  key={type}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Badge
                    variant="outline"
                    className="cursor-pointer hover:bg-neon/10 hover:border-neon/30 hover:text-neon transition-colors"
                  >
                    {type}
                  </Badge>
                </motion.button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={closeModal}>
            Cancel
          </Button>
          <Button onClick={closeModal} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Add Prospect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
