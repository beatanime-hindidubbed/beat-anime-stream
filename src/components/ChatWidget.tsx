import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { sanitizeMessage } from "@/lib/profanityFilter";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageCircle, X, Send, AlertTriangle, Users, Lock,
  Reply, Trash2, Ban, Volume2, VolumeX, Image as ImageIcon,
  ChevronDown, Shield, Crown, Pin
} from "lucide-react";

type ChatMode = "group" | "report" | "whisper";

interface ChatMsg {
  id: string;
  user_id: string;
  username: string | null;
  content: string;
  type: string;
  recipient_id: string | null;
  reply_to: string | null;
  is_deleted: boolean;
  image_url: string | null;
  created_at: string;
}

interface ChatBan {
  id: string;
  user_id: string;
  ban_type: string;
  expires_at: string | null;
}

const PINNED_MSG = "⚠️ Chat auto-clears every 7 days. Be respectful. No personal info sharing.";

export default function ChatWidget() {
  const { user, isAdmin } = useSupabaseAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("group");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMsg | null>(null);
  const [whisperTo, setWhisperTo] = useState<string | null>(null);
  const [whisperUsername, setWhisperUsername] = useState("");
  const [isBanned, setIsBanned] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showPin, setShowPin] = useState(true);
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!user) return;
    let query = supabase
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100);

    if (mode === "group") {
      query = query.eq("type", "group");
    } else if (mode === "report") {
      query = query.eq("type", "report");
    } else if (mode === "whisper" && whisperTo) {
      query = query.eq("type", "whisper").or(`and(user_id.eq.${user.id},recipient_id.eq.${whisperTo}),and(user_id.eq.${whisperTo},recipient_id.eq.${user.id})`);
    }

    const { data } = await query;
    if (data) setMessages(data as unknown as ChatMsg[]);
  }, [user, mode, whisperTo]);

  // Check ban status
  useEffect(() => {
    if (!user) return;
    const checkBan = async () => {
      const { data } = await supabase
        .from("chat_bans")
        .select("*")
        .eq("user_id", user.id);
      if (data && data.length > 0) {
        const activeBan = (data as unknown as ChatBan[]).find(b => {
          if (!b.expires_at) return true;
          return new Date(b.expires_at) > new Date();
        });
        if (activeBan) {
          if (activeBan.ban_type === "ban") setIsBanned(true);
          if (activeBan.ban_type === "mute") setIsMuted(true);
        }
      }
    };
    checkBan();
  }, [user]);

  // Load on open/mode change
  useEffect(() => {
    if (open && user) loadMessages();
  }, [open, mode, whisperTo, loadMessages, user]);

  // Realtime subscription
  useEffect(() => {
    if (!open || !user) return;
    const channel = supabase
      .channel("chat-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
        const msg = payload.new as unknown as ChatMsg;
        if (mode === "group" && msg.type === "group") {
          setMessages(prev => [...prev, msg]);
        } else if (mode === "report" && msg.type === "report") {
          setMessages(prev => [...prev, msg]);
        } else if (mode === "whisper" && msg.type === "whisper") {
          if ((msg.user_id === user.id && msg.recipient_id === whisperTo) ||
              (msg.user_id === whisperTo && msg.recipient_id === user.id)) {
            setMessages(prev => [...prev, msg]);
          }
        }
        if (!open) setUnread(prev => prev + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [open, user, mode, whisperTo]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!user || !input.trim() || sending || isBanned || isMuted) return;
    setSending(true);

    const clean = sanitizeMessage(input.trim());

    // Block links that aren't https
    const urlPattern = /http:\/\/\S+/gi;
    if (urlPattern.test(clean)) {
      setSending(false);
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("user_id", user.id)
      .single();

    const msg: any = {
      user_id: user.id,
      username: profile?.username || "Anonymous",
      avatar_url: profile?.avatar_url || null,
      content: clean,
      type: mode,
      recipient_id: mode === "whisper" ? whisperTo : null,
      reply_to: replyTo?.id || null,
    };

    await supabase.from("chat_messages").insert(msg);
    setInput("");
    setReplyTo(null);
    setSending(false);
    inputRef.current?.focus();
  };

  // Admin actions
  const deleteMessage = async (id: string) => {
    await supabase.from("chat_messages").update({ is_deleted: true, content: "[deleted by admin]" }).eq("id", id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, is_deleted: true, content: "[deleted by admin]" } : m));
  };

  const banUser = async (userId: string, type: "mute" | "ban") => {
    if (!user) return;
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);
    await supabase.from("chat_bans").insert({
      user_id: userId,
      banned_by: user.id,
      ban_type: type,
      reason: "Admin action",
      expires_at: expires.toISOString(),
    });
  };

  const startWhisper = (userId: string, username: string) => {
    setMode("whisper");
    setWhisperTo(userId);
    setWhisperUsername(username);
  };

  if (!user) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={() => { setOpen(true); setUnread(0); }}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center"
        >
          <MessageCircle className="w-6 h-6" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </motion.button>
      )}

      {/* Chat panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-4 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-2rem)] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-primary" />
                <span className="font-display font-bold text-sm text-foreground">
                  {mode === "group" ? "Group Chat" : mode === "report" ? "Report Bug" : `Whisper: ${whisperUsername}`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Mode tabs */}
            <div className="flex border-b border-border bg-secondary/30">
              {([
                { key: "group" as const, icon: Users, label: "Group" },
                { key: "report" as const, icon: AlertTriangle, label: "Report" },
                ...(mode === "whisper" ? [{ key: "whisper" as const, icon: Lock, label: "Whisper" }] : []),
              ]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setMode(t.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
                    mode === t.key ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <t.icon className="w-3 h-3" />
                  {t.label}
                </button>
              ))}
            </div>

            {/* Pinned notice */}
            {showPin && (
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-b border-border text-[11px] text-muted-foreground">
                <Pin className="w-3 h-3 text-primary flex-shrink-0" />
                <span className="flex-1">{PINNED_MSG}</span>
                <button onClick={() => setShowPin(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Ban notice */}
            {(isBanned || isMuted) && (
              <div className="px-3 py-2 bg-destructive/10 border-b border-border text-xs text-destructive flex items-center gap-2">
                <Ban className="w-3 h-3" />
                {isBanned ? "You are banned from chat." : "You are muted by an admin."}
              </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-hide">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                  <MessageCircle className="w-8 h-8 mb-2 opacity-30" />
                  <p>{mode === "report" ? "Report a bug or issue" : "No messages yet"}</p>
                </div>
              )}
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`group flex gap-2 ${msg.user_id === user.id ? "flex-row-reverse" : ""}`}
                >
                  {/* Avatar */}
                  <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${
                    msg.user_id === user.id ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                  }`}>
                    {(msg.username || "?")[0]?.toUpperCase()}
                  </div>
                  {/* Bubble */}
                  <div className={`max-w-[75%] ${msg.user_id === user.id ? "text-right" : ""}`}>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[10px] font-medium text-foreground">{msg.username || "Anonymous"}</span>
                      <span className="text-[9px] text-muted-foreground">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>

                    {/* Reply indicator */}
                    {msg.reply_to && (
                      <div className="text-[9px] text-muted-foreground bg-secondary/50 rounded px-1.5 py-0.5 mb-0.5 inline-block">
                        ↩ Reply
                      </div>
                    )}

                    <div className={`px-3 py-1.5 rounded-xl text-sm break-words ${
                      msg.is_deleted
                        ? "bg-destructive/10 text-destructive/60 italic"
                        : msg.user_id === user.id
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-secondary text-secondary-foreground rounded-tl-sm"
                    }`}>
                      {msg.content}
                    </div>

                    {msg.image_url && !msg.is_deleted && (
                      <img src={msg.image_url} alt="" className="mt-1 rounded-lg max-h-40 object-cover" />
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!msg.is_deleted && (
                        <button onClick={() => setReplyTo(msg)} className="p-0.5 rounded hover:bg-secondary">
                          <Reply className="w-3 h-3 text-muted-foreground" />
                        </button>
                      )}
                      {msg.user_id !== user.id && (
                        <button onClick={() => startWhisper(msg.user_id, msg.username || "User")} className="p-0.5 rounded hover:bg-secondary">
                          <Lock className="w-3 h-3 text-muted-foreground" />
                        </button>
                      )}
                      {isAdmin && !msg.is_deleted && (
                        <>
                          <button onClick={() => deleteMessage(msg.id)} className="p-0.5 rounded hover:bg-destructive/20">
                            <Trash2 className="w-3 h-3 text-destructive" />
                          </button>
                          {msg.user_id !== user.id && (
                            <>
                              <button onClick={() => banUser(msg.user_id, "mute")} title="Mute 7 days" className="p-0.5 rounded hover:bg-destructive/20">
                                <VolumeX className="w-3 h-3 text-destructive" />
                              </button>
                              <button onClick={() => banUser(msg.user_id, "ban")} title="Ban 7 days" className="p-0.5 rounded hover:bg-destructive/20">
                                <Ban className="w-3 h-3 text-destructive" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply indicator */}
            {replyTo && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 border-t border-border text-xs text-muted-foreground">
                <Reply className="w-3 h-3" />
                <span className="truncate">Replying to {replyTo.username}</span>
                <button onClick={() => setReplyTo(null)} className="ml-auto">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Input */}
            <div className="border-t border-border p-3 flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={isBanned ? "You are banned" : isMuted ? "You are muted" : mode === "report" ? "Describe the issue..." : "Type a message..."}
                disabled={isBanned || isMuted}
                className="flex-1 h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                maxLength={500}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || sending || isBanned || isMuted}
                className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
