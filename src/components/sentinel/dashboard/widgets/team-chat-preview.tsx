"use client";

import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSentinelStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const userColors: Record<string, string> = {
  "user-adam": "bg-cyan/8 text-cyan",
  "user-sarah": "bg-purple-500/10 text-purple-400",
  "user-mike": "bg-blue-500/10 text-blue-400",
};

export function TeamChatPreview() {
  const { chatMessages, setChatOpen } = useSentinelStore();
  const recent = chatMessages.slice(-3);

  return (
    <div className="space-y-2">
      {recent.map((msg, i) => (
        <motion.div
          key={msg.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="flex items-start gap-2"
        >
          <Avatar className="h-5 w-5 shrink-0 mt-0.5">
            <AvatarFallback className={cn("text-[8px]", userColors[msg.user_id] || "bg-secondary")}>
              {msg.user_name.split(" ").map((n) => n[0]).join("")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <span className="text-[10px] font-medium">{msg.user_name}</span>
            <p className="text-[10px] text-muted-foreground truncate">{msg.content}</p>
          </div>
        </motion.div>
      ))}
      <button
        onClick={() => setChatOpen(true)}
        className="w-full text-center text-[10px] text-cyan hover:underline cursor-pointer pt-1"
      >
        Open Chat
      </button>
      {/* TODO: Real-time subscription for new messages */}
      {/* TODO: Unread count badge */}
    </div>
  );
}
