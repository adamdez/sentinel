"use client";

import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useModal } from "@/providers/modal-provider";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function FloatingActionButton() {
  const { openModal } = useModal();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => openModal("new-prospect")}
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-[0_0_1px_var(--overlay-80),0_0_3.5px_var(--overlay-50),0_0_7px_var(--glow-medium),0_0_11px_var(--overlay-10)] hover:shadow-[0_0_1px_rgba(15,238,255,1),0_0_4px_rgba(15,238,255,0.56),0_0_8px_rgba(15,238,255,0.3),0_0_13px_rgba(15,238,255,0.14)] transition-shadow cursor-pointer"
        >
          <Plus className="h-5 w-5" />
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="left">New Lead</TooltipContent>
    </Tooltip>
  );
}
