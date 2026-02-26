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
          className="fixed bottom-6 right-6 z-40 h-12 w-12 rounded-full bg-neon text-primary-foreground flex items-center justify-center shadow-[0_0_30px_rgba(0,255,136,0.3)] hover:shadow-[0_0_40px_rgba(0,255,136,0.5)] transition-shadow cursor-pointer"
        >
          <Plus className="h-5 w-5" />
        </motion.button>
      </TooltipTrigger>
      <TooltipContent side="left">New Prospect</TooltipContent>
    </Tooltip>
  );
}
