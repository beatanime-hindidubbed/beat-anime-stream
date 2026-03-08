import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { sanitizeMessage } from "@/lib/profanityFilter";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageCircle, X, Send, AlertTriangle, Users, Lock,
  Reply, Trash2, Ban, VolumeX,
  ChevronDown, Pin, Smile, Forward, Heart, ThumbsUp, ThumbsDown,
  Flame, Star, Laugh, Check, CheckCheck, Eraser, Shield, Image as ImageIcon
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
  avatar_url: string | null;
}

interface ChatBan {
  id: string;
  user_id: string;
  ban_type: string;
  expires_at: string | null;
}

const REACTIONS = [
  { emoji: "❤️", icon: Heart },
  { emoji: "👍", icon: ThumbsUp },
  { emoji: "👎", icon: ThumbsDown },
  { emoji: "🔥", icon: Flame },
  { emoji: "⭐", icon: Star },
  { emoji: "😂", icon: Laugh },
];

const PINNED_MSG = "⚠️ Chat auto-clears every 7 days. Be respectful. No personal info sharing.";

// Curated GIF stickers
const GIF_STICKERS = [
  { name: "👋 Hi", url: "https://media.tenor.com/images/66a0f8a3ed251d7989de0e3929f5e8ce/tenor.gif" },
  { name: "😂 LOL", url: "https://media.tenor.com/images/73c9e7d6a1cf79f0e3c4be7f6c79e899/tenor.gif" },
  { name: "👏 Clap", url: "https://media.tenor.com/images/2a03d98b8f9b8fe8e7e4bc6e8f8dd4f0/tenor.gif" },
  { name: "🔥 Fire", url: "https://media.tenor.com/images/42a43ee3c02c1d1b35b0c88ec1e79e71/tenor.gif" },
  { name: "💀 Dead", url: "https://media.tenor.com/images/e9f60ae9c2c5e2d9a6e66bee6e8cf5a5/tenor.gif" },
  { name: "🥺 Please", url: "https://media.tenor.com/images/4e95d7d7f5f0a62f55e1dbf1aab0a8a0/tenor.gif" },
  { name: "🤯 Mind", url: "https://media.tenor.com/images/87c71ad01c6868a86b20f9b9e5e76b5d/tenor.gif" },
  { name: "🎉 Party", url: "https://media.tenor.com/images/4a6c0f1c44b8f9d9ad1f0f6a0aa7ae12/tenor.gif" },
];

const QUICK_EMOJIS = ["😀", "😂", "😍", "🤔", "😭", "😎", "🔥", "👀", "💀", "🎉", "❤️", "👍", "🙏", "💯", "✨", "🤡"];

export default function ChatWidget() {
  const { user, isAdmin } = useSupabaseAuth();
  const { settings } = useSiteSettings();
  const perms = settings.chatPermissions;
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("group");
  const [lastSentAt, setLastSentAt] = useState(0);
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
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Record<string, Record<string, string[]>>>({});
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isTyping, setIsTyping] = useState(false);
  const [forwardMsg, setForwardMsg] = useState<ChatMsg | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<"emoji" | "sticker">("emoji");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

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

  useEffect(() => {
    if (!user) return;
    const checkBan = async () => {
      const { data } = await supabase.from("chat_bans").select("*").eq("user_id", user.id);
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

  useEffect(() => {
    if (open && user) loadMessages();
  }, [open, mode, whisperTo, loadMessages, user]);

  useEffect(() => {
    if (!open || !user) return;
    const channel = supabase
      .channel("chat-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_messages" }, (payload) => {
        if (payload.eventType === "INSERT") {
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
        } else if (payload.eventType === "UPDATE") {
          const updated = payload.new as unknown as ChatMsg;
          setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
        } else if (payload.eventType === "DELETE") {
          const deleted = payload.old as unknown as { id: string };
          setMessages(prev => prev.filter(m => m.id !== deleted.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [open, user, mode, whisperTo]);

  useEffect(() => {
    if (!open || !user) return;
    const channel = supabase.channel("chat-typing", { config: { presence: { key: user.id } } });
    
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const typing = new Set<string>();
      Object.entries(state).forEach(([uid, data]) => {
        if (uid !== user.id && Array.isArray(data) && data.some((d: any) => d.typing)) {
          typing.add(uid);
        }
      });
      setTypingUsers(typing);
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ typing: false });
      }
    });

    return () => { supabase.removeChannel(channel); };
  }, [open, user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      const channel = supabase.channel("chat-typing");
      channel.send({ type: "presence", event: "track", payload: { typing: true } }).catch(() => {});
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      const channel = supabase.channel("chat-typing");
      channel.send({ type: "presence", event: "track", payload: { typing: false } }).catch(() => {});
    }, 2000);
  };

  const sendMessage = async (overrideContent?: string) => {
    const content = overrideContent || input.trim();
    if (!user || !content || sending || isBanned || isMuted) return;
    if (!isAdmin && !perms.sendMessages) return;

    if (!isAdmin && perms.slowMode > 0) {
      const now = Date.now();
      if (now - lastSentAt < perms.slowMode * 1000) return;
    }

    setSending(true);

    const clean = overrideContent ? content : sanitizeMessage(content);

    const urlPattern = /https?:\/\/\S+/gi;
    if (!isAdmin && !perms.sendLinks && urlPattern.test(clean)) { setSending(false); return; }
    if (/http:\/\/\S+/gi.test(clean)) { setSending(false); return; }

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
    setForwardMsg(null);
    setSending(false);
    setShowEmojiPicker(false);
    setShowStickerPicker(false);
    setLastSentAt(Date.now());
    inputRef.current?.focus();
  };

  const sendSticker = (stickerUrl: string, name: string) => {
    sendMessage(`[sticker:${name}] ${stickerUrl}`);
    setShowStickerPicker(false);
  };

  const addReaction = (msgId: string, emoji: string) => {
    setReactions(prev => {
      const msgReactions = { ...(prev[msgId] || {}) };
      const users = msgReactions[emoji] || [];
      if (users.includes(user!.id)) {
        msgReactions[emoji] = users.filter(u => u !== user!.id);
        if (msgReactions[emoji].length === 0) delete msgReactions[emoji];
      } else {
        msgReactions[emoji] = [...users, user!.id];
      }
      return { ...prev, [msgId]: msgReactions };
    });
    setShowReactions(null);
  };

  const forwardMessage = (msg: ChatMsg) => {
    setInput(`↪ ${msg.username}: "${msg.content}"`);
    setForwardMsg(null);
    inputRef.current?.focus();
  };

  // Admin delete — marks as deleted with indicator
  const deleteMessage = async (id: string) => {
    await supabase.from("chat_messages").update({ is_deleted: true, content: "🚫 This message was deleted by admin" } as any).eq("id", id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, is_deleted: true, content: "🚫 This message was deleted by admin" } : m));
  };

  // User delete own message
  const deleteOwnMessage = async (id: string) => {
    await supabase.from("chat_messages").update({ is_deleted: true, content: "🚫 This message was deleted" } as any).eq("id", id);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, is_deleted: true, content: "🚫 This message was deleted" } : m));
  };

  // Clear chat (admin: all messages in current mode, user: own messages)
  const clearChat = async () => {
    if (!user) return;
    if (isAdmin) {
      // Admin clears all visible messages in current mode
      const ids = messages.filter(m => !m.is_deleted).map(m => m.id);
      if (ids.length === 0) return;
      for (const id of ids) {
        await supabase.from("chat_messages").update({ is_deleted: true, content: "🚫 Chat cleared by admin" } as any).eq("id", id);
      }
      setMessages(prev => prev.map(m => ids.includes(m.id) ? { ...m, is_deleted: true, content: "🚫 Chat cleared by admin" } : m));
    } else {
      // User clears own messages
      const ids = messages.filter(m => m.user_id === user.id && !m.is_deleted).map(m => m.id);
      for (const id of ids) {
        await supabase.from("chat_messages").update({ is_deleted: true, content: "🚫 This message was deleted" } as any).eq("id", id);
      }
      setMessages(prev => prev.map(m => ids.includes(m.id) ? { ...m, is_deleted: true, content: "🚫 This message was deleted" } : m));
    }
  };

  // Whisper to admin shortcut
  const whisperToAdmin = async () => {
    // Find any admin from user_roles
    const { data } = await supabase.from("user_roles").select("user_id").eq("role", "admin").limit(1);
    if (data && data.length > 0) {
      const adminId = data[0].user_id;
      const { data: profile } = await supabase.from("profiles").select("username").eq("user_id", adminId).single();
      startWhisper(adminId, profile?.username || "Admin");
    }
  };

  const banUser = async (userId: string, type: "mute" | "ban") => {
    if (!user) return;
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);
    await supabase.from("chat_bans").insert({
      user_id: userId, banned_by: user.id, ban_type: type,
      reason: "Admin action", expires_at: expires.toISOString(),
    });
  };

  const startWhisper = (userId: string, username: string) => {
    setMode("whisper"); setWhisperTo(userId); setWhisperUsername(username);
  };

  // Check if content is a sticker
  const isSticker = (content: string) => content.startsWith("[sticker:");
  const getStickerUrl = (content: string) => {
    const match = content.match(/\]\s*(https?:\/\/\S+)/);
    return match ? match[1] : null;
  };

  if (!user) return null;
  if (!settings.chatEnabled && !isAdmin) return null;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <motion.button
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          onClick={() => { setOpen(true); setUnread(0); }}
          className="fixed bottom-20 right-3 sm:bottom-4 sm:right-4 z-50 w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center safe-area-bottom"
        >
          <MessageCircle className="w-5 h-5" />
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
            className="fixed inset-0 sm:inset-auto sm:bottom-4 sm:right-4 z-50 w-full sm:w-[380px] sm:max-w-[calc(100vw-2rem)] h-[100dvh] sm:h-[min(540px,calc(100vh-2rem))] flex flex-col bg-card sm:border border-border sm:rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <MessageCircle className="w-4 h-4 text-primary shrink-0" />
                <span className="font-display font-bold text-sm text-foreground truncate">
                  {mode === "group" ? "Group Chat" : mode === "report" ? "Report Bug" : `Whisper: ${whisperUsername}`}
                </span>
                <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* Whisper to admin */}
                {!isAdmin && (
                  <button onClick={whisperToAdmin} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title="Whisper to Admin">
                    <Shield className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
                {/* Clear chat */}
                <button onClick={clearChat} className="p-1.5 rounded-lg hover:bg-secondary transition-colors" title={isAdmin ? "Clear all messages" : "Clear my messages"}>
                  <Eraser className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Mode tabs */}
            <div className="flex border-b border-border bg-secondary/30 shrink-0">
              {([
                { key: "group" as const, icon: Users, label: "Group" },
                { key: "report" as const, icon: AlertTriangle, label: "Report" },
                ...(mode === "whisper" ? [{ key: "whisper" as const, icon: Lock, label: "Whisper" }] : []),
              ]).map(t => (
                <button key={t.key} onClick={() => setMode(t.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors ${
                    mode === t.key ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
                  }`}>
                  <t.icon className="w-3.5 h-3.5" /> {t.label}
                </button>
              ))}
            </div>

            {/* Pinned notice */}
            {showPin && (
              <div className="flex items-center gap-2 px-3 py-2 bg-primary/5 border-b border-border text-[11px] text-muted-foreground shrink-0">
                <Pin className="w-3 h-3 text-primary flex-shrink-0" />
                <span className="flex-1 line-clamp-1">{PINNED_MSG}</span>
                <button onClick={() => setShowPin(false)} className="text-muted-foreground hover:text-foreground shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Ban notice */}
            {(isBanned || isMuted) && (
              <div className="px-3 py-2 bg-destructive/10 border-b border-border text-xs text-destructive flex items-center gap-2 shrink-0">
                <Ban className="w-3 h-3" />
                {isBanned ? "You are banned from chat." : "You are muted by an admin."}
              </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5 scrollbar-hide min-h-0">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
                  <MessageCircle className="w-8 h-8 mb-2 opacity-30" />
                  <p>{mode === "report" ? "Report a bug or issue" : "No messages yet"}</p>
                </div>
              )}
              {messages.map((msg, i) => {
                const isOwn = msg.user_id === user.id;
                const msgReactions = reactions[msg.id] || {};
                const prevMsg = messages[i - 1];
                const sameUser = prevMsg?.user_id === msg.user_id;
                const stickerUrl = isSticker(msg.content) ? getStickerUrl(msg.content) : null;
                
                return (
                  <div key={msg.id} className={`group flex gap-2 ${isOwn ? "flex-row-reverse" : ""} ${sameUser ? "mt-0.5" : "mt-3"}`}>
                    {/* Avatar */}
                    {!sameUser ? (
                      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold ${
                        isOwn ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
                      }`}>
                        {msg.avatar_url ? (
                          <img src={msg.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                        ) : (msg.username || "?")[0]?.toUpperCase()}
                      </div>
                    ) : <div className="w-7 flex-shrink-0" />}

                    {/* Bubble */}
                    <div className={`max-w-[75%] min-w-0 ${isOwn ? "text-right" : ""}`}>
                      {!sameUser && (
                        <div className={`flex items-center gap-1.5 mb-0.5 ${isOwn ? "justify-end" : ""}`}>
                          <span className="text-[10px] font-medium text-foreground truncate max-w-[120px]">{msg.username || "Anonymous"}</span>
                          <span className="text-[9px] text-muted-foreground shrink-0">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      )}

                      {msg.reply_to && (
                        <div className="text-[9px] text-muted-foreground bg-secondary/50 rounded px-1.5 py-0.5 mb-0.5 inline-block">
                          ↩ Reply
                        </div>
                      )}

                      {/* Sticker message */}
                      {stickerUrl && !msg.is_deleted ? (
                        <div className={`${isOwn ? "ml-auto" : ""}`}>
                          <img src={stickerUrl} alt="sticker" className="w-24 h-24 object-contain rounded-lg" loading="lazy" />
                        </div>
                      ) : (
                        <div className={`relative px-3 py-1.5 rounded-2xl text-sm break-words ${
                          msg.is_deleted
                            ? "bg-secondary/40 text-muted-foreground/60 italic text-xs"
                            : isOwn
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-secondary text-secondary-foreground rounded-tl-sm"
                        }`}>
                          {msg.content}
                          {isOwn && !msg.is_deleted && (
                            <span className="inline-flex ml-1.5 align-bottom">
                              <CheckCheck className="w-3 h-3 text-primary-foreground/60" />
                            </span>
                          )}
                        </div>
                      )}

                      {msg.image_url && !msg.is_deleted && (
                        <img src={msg.image_url} alt="" className="mt-1 rounded-lg max-h-40 object-cover" />
                      )}

                      {/* Reactions display */}
                      {Object.keys(msgReactions).length > 0 && (
                        <div className={`flex gap-1 mt-0.5 flex-wrap ${isOwn ? "justify-end" : ""}`}>
                          {Object.entries(msgReactions).map(([emoji, users]) => (
                            <button key={emoji} onClick={() => addReaction(msg.id, emoji)}
                              className={`px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
                                users.includes(user.id) ? "border-primary/40 bg-primary/10" : "border-border bg-secondary/50 hover:bg-secondary"
                              }`}>
                              {emoji} {users.length}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className={`flex items-center gap-0.5 mt-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity ${isOwn ? "justify-end" : ""}`}>
                        {!msg.is_deleted && (
                          <>
                            <button onClick={() => setShowReactions(showReactions === msg.id ? null : msg.id)}
                              className="p-1 rounded hover:bg-secondary" title="React">
                              <Smile className="w-3 h-3 text-muted-foreground" />
                            </button>
                            <button onClick={() => setReplyTo(msg)} className="p-1 rounded hover:bg-secondary" title="Reply">
                              <Reply className="w-3 h-3 text-muted-foreground" />
                            </button>
                            <button onClick={() => forwardMessage(msg)} className="p-1 rounded hover:bg-secondary" title="Forward">
                              <Forward className="w-3 h-3 text-muted-foreground" />
                            </button>
                          </>
                        )}
                        {/* User delete own message */}
                        {isOwn && !msg.is_deleted && (
                          <button onClick={() => deleteOwnMessage(msg.id)} className="p-1 rounded hover:bg-destructive/20" title="Delete">
                            <Trash2 className="w-3 h-3 text-destructive/70" />
                          </button>
                        )}
                        {!isOwn && (
                          <button onClick={() => startWhisper(msg.user_id, msg.username || "User")} className="p-1 rounded hover:bg-secondary" title="Whisper">
                            <Lock className="w-3 h-3 text-muted-foreground" />
                          </button>
                        )}
                        {isAdmin && !msg.is_deleted && !isOwn && (
                          <>
                            <button onClick={() => deleteMessage(msg.id)} className="p-1 rounded hover:bg-destructive/20" title="Delete (Admin)">
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </button>
                            <button onClick={() => banUser(msg.user_id, "mute")} title="Mute 7d" className="p-1 rounded hover:bg-destructive/20">
                              <VolumeX className="w-3 h-3 text-destructive" />
                            </button>
                            <button onClick={() => banUser(msg.user_id, "ban")} title="Ban 7d" className="p-1 rounded hover:bg-destructive/20">
                              <Ban className="w-3 h-3 text-destructive" />
                            </button>
                          </>
                        )}
                      </div>

                      {/* Reaction picker */}
                      {showReactions === msg.id && (
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                          className={`flex gap-1 mt-1 p-1.5 rounded-xl bg-card border border-border shadow-lg ${isOwn ? "justify-end" : ""}`}>
                          {REACTIONS.map(r => (
                            <button key={r.emoji} onClick={() => addReaction(msg.id, r.emoji)}
                              className="w-7 h-7 rounded-lg hover:bg-secondary flex items-center justify-center text-sm transition-transform hover:scale-125 active:scale-95">
                              {r.emoji}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator */}
              {typingUsers.size > 0 && (
                <div className="flex items-center gap-2 py-1">
                  <div className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">typing...</span>
                </div>
              )}
            </div>

            {/* Reply indicator */}
            {replyTo && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 border-t border-border text-xs text-muted-foreground shrink-0">
                <Reply className="w-3 h-3 shrink-0" />
                <span className="truncate flex-1">Replying to <strong>{replyTo.username}</strong>: {replyTo.content.slice(0, 50)}</span>
                <button onClick={() => setReplyTo(null)} className="shrink-0"><X className="w-3 h-3" /></button>
              </div>
            )}

            {/* Emoji + Sticker picker */}
            <AnimatePresence>
              {(showEmojiPicker || showStickerPicker) && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
                  className="border-t border-border bg-card shrink-0">
                  {/* Tab switcher */}
                  <div className="flex border-b border-border">
                    <button onClick={() => { setPickerTab("emoji"); setShowEmojiPicker(true); setShowStickerPicker(false); }}
                      className={`flex-1 py-1.5 text-xs font-medium transition-colors ${pickerTab === "emoji" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>
                      😀 Emoji
                    </button>
                    <button onClick={() => { setPickerTab("sticker"); setShowStickerPicker(true); setShowEmojiPicker(false); }}
                      className={`flex-1 py-1.5 text-xs font-medium transition-colors ${pickerTab === "sticker" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>
                      🎭 Stickers
                    </button>
                  </div>

                  {pickerTab === "emoji" ? (
                    <div className="p-2 grid grid-cols-8 gap-1">
                      {QUICK_EMOJIS.map(e => (
                        <button key={e} onClick={() => { setInput(prev => prev + e); inputRef.current?.focus(); }}
                          className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center text-lg transition-transform hover:scale-110 active:scale-95">
                          {e}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2 grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                      {GIF_STICKERS.map((sticker) => (
                        <button key={sticker.name} onClick={() => sendSticker(sticker.url, sticker.name)}
                          className="flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-secondary transition-colors">
                          <img src={sticker.url} alt={sticker.name} className="w-14 h-14 object-cover rounded" loading="lazy" />
                          <span className="text-[9px] text-muted-foreground truncate w-full text-center">{sticker.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Input */}
            <div className="border-t border-border p-2 sm:p-3 flex items-center gap-2 bg-card shrink-0 safe-area-bottom">
              <button onClick={() => {
                const wasOpen = showEmojiPicker || showStickerPicker;
                setShowEmojiPicker(!wasOpen); setShowStickerPicker(false); setPickerTab("emoji");
              }}
                className={`p-2 rounded-lg transition-colors shrink-0 ${showEmojiPicker || showStickerPicker ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                <Smile className="w-4 h-4" />
              </button>
              <button onClick={() => {
                const wasOpen = showStickerPicker;
                setShowStickerPicker(!wasOpen); setShowEmojiPicker(false); setPickerTab("sticker");
              }}
                className={`p-2 rounded-lg transition-colors shrink-0 ${showStickerPicker ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
                <ImageIcon className="w-4 h-4" />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={e => { setInput(e.target.value); handleTyping(); }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={isBanned ? "You are banned" : isMuted ? "You are muted" : (!isAdmin && !perms.sendMessages) ? "Messaging disabled" : mode === "report" ? "Describe the issue..." : perms.slowMode > 0 ? `Type a message... (slow mode: ${perms.slowMode}s)` : "Type a message..."}
                disabled={isBanned || isMuted || (!isAdmin && !perms.sendMessages)}
                className="flex-1 h-9 px-3 rounded-lg bg-secondary text-foreground text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 min-w-0"
                maxLength={500}
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || sending || isBanned || isMuted || (!isAdmin && !perms.sendMessages)}
                className="w-9 h-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 hover:opacity-90 active:scale-95 transition-all shrink-0"
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
