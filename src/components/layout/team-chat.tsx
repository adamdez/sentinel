"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Send, X, Minimize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSentinelStore } from "@/lib/store";
import { generateId } from "@/lib/utils";

const userColors: Record<string, string> = {
  "user-adam": "text-cyan",
  "user-sarah": "text-purple-400",
  "user-mike": "text-blue-400",
};

export function TeamChat() {
  const { chatOpen, setChatOpen, chatMessages, addChatMessage, currentUser } =
    useSentinelStore();
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (!message.trim()) return;
    addChatMessage({
      id: generateId(),
      user_id: currentUser.id,
      user_name: currentUser.name,
      content: message,
      timestamp: new Date().toISOString(),
    });
    setMessage("");
  };

  return (
    <>
      <AnimatePresence>
        {!chatOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setChatOpen(true)}
            className="fixed bottom-6 right-20 z-40 h-10 w-10 rounded-full bg-secondary border border-glass-border flex items-center justify-center hover:bg-accent transition-colors cursor-pointer"
          >
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-cyan border-2 border-background" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-40 w-80 h-96 rounded-[14px] glass-strong border border-glass-border flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-cyan" />
                <span className="text-sm font-medium">Team Chat</span>
                <span className="h-2 w-2 rounded-full bg-cyan animate-pulse" />
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setChatOpen(false)}
                >
                  <Minimize2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setChatOpen(false)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 px-4 py-3">
              <div className="space-y-3">
                {chatMessages.map((msg) => {
                  const isMe = msg.user_id === currentUser.id;
                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex gap-2 ${isMe ? "flex-row-reverse" : ""}`}
                    >
                      <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                        <AvatarFallback className="text-[9px] bg-secondary">
                          {msg.user_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div
                        className={`rounded-lg px-3 py-1.5 text-xs max-w-[200px] ${
                          isMe
                            ? "bg-cyan/8 border border-cyan/15"
                            : "bg-secondary/50 border border-glass-border"
                        }`}
                      >
                        {!isMe && (
                          <span
                            className={`font-medium block mb-0.5 ${
                              userColors[msg.user_id] || "text-foreground"
                            }`}
                          >
                            {msg.user_name}
                          </span>
                        )}
                        <p className="text-foreground/90">{msg.content}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="px-3 py-2 border-t border-glass-border">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2"
              >
                <Input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Message team..."
                  className="h-8 text-xs bg-secondary/30"
                />
                <Button
                  type="submit"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
