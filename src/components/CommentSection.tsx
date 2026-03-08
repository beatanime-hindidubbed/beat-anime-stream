import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { sanitizeMessage, containsProfanity } from "@/lib/profanityFilter";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Trash2, Flag, MessageSquare, Shield, Loader2, Reply, ChevronDown, MessageCircleOff } from "lucide-react";

interface Comment {
  id: string;
  user_id: string;
  episode_id: string;
  anime_id: string;
  content: string;
  is_censored: boolean;
  is_deleted: boolean;
  parent_id: string | null;
  created_at: string;
  username?: string;
  avatar_url?: string;
  replies?: Comment[];
}

interface Props {
  episodeId: string;
  animeId: string;
}

const RATE_LIMIT_SECONDS = 15;

export default function CommentSection({ episodeId, animeId }: Props) {
  const { user, isAdmin } = useSupabaseAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadComments = useCallback(async () => {
    const { data } = await supabase
      .from("comments")
      .select("*")
      .eq("episode_id", episodeId)
      .eq("is_deleted", false)
      .order("created_at", { ascending: false })
      .limit(100);

    if (!data) { setLoading(false); return; }

    // Enrich with profile data
    const userIds = [...new Set(data.map(c => c.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, username, avatar_url")
      .in("user_id", userIds);

    const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

    const enriched: Comment[] = data.map(c => ({
      ...c,
      username: profileMap.get(c.user_id)?.username || "Anonymous",
      avatar_url: profileMap.get(c.user_id)?.avatar_url || null,
    }));

    // Build tree
    const topLevel = enriched.filter(c => !c.parent_id);
    const replies = enriched.filter(c => c.parent_id);
    topLevel.forEach(c => {
      c.replies = replies.filter(r => r.parent_id === c.id);
    });

    setComments(topLevel);
    setLoading(false);
  }, [episodeId]);

  useEffect(() => { loadComments(); }, [loadComments]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`comments-${episodeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `episode_id=eq.${episodeId}` }, () => {
        loadComments();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [episodeId, loadComments]);

  const checkRateLimit = async (): Promise<boolean> => {
    if (!user) return false;
    const since = new Date(Date.now() - RATE_LIMIT_SECONDS * 1000).toISOString();
    const { data } = await supabase
      .from("rate_limits")
      .select("id")
      .eq("user_id", user.id)
      .eq("action", "comment")
      .gte("created_at", since);
    return !data || data.length === 0;
  };

  const handleSubmit = async () => {
    if (!user || !newComment.trim() || posting) return;

    const raw = newComment.trim();
    if (raw.length > 500) { setError("Comment too long (max 500 chars)"); return; }

    // Rate limit check
    const canPost = await checkRateLimit();
    if (!canPost) { setError(`Please wait ${RATE_LIMIT_SECONDS}s between comments`); return; }

    setPosting(true); setError("");

    const hasBadWords = containsProfanity(raw);
    const cleaned = sanitizeMessage(raw);

    const { error: insertError } = await supabase.from("comments").insert({
      user_id: user.id,
      episode_id: episodeId,
      anime_id: animeId,
      content: cleaned,
      is_censored: hasBadWords,
      parent_id: replyTo,
    });

    // Record rate limit
    await supabase.from("rate_limits").insert({ user_id: user.id, action: "comment" });

    if (insertError) { setError("Failed to post comment"); }
    else { setNewComment(""); setReplyTo(null); }
    setPosting(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("comments").update({ is_deleted: true, content: "[deleted]" }).eq("id", id);
    loadComments();
  };

  const displayComments = showAll ? comments : comments.slice(0, 5);

  const renderComment = (comment: Comment, isReply = false) => (
    <motion.div
      key={comment.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isReply ? "ml-8 sm:ml-12" : ""}`}
    >
      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gradient-primary flex items-center justify-center flex-shrink-0 text-xs font-bold text-primary-foreground">
        {comment.avatar_url ? (
          <img src={comment.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
        ) : (
          (comment.username || "A")[0].toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate max-w-[120px] sm:max-w-none">{comment.username}</span>
          <span className="text-[10px] text-muted-foreground">{timeAgo(comment.created_at)}</span>
          {comment.is_censored && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-medium">Filtered</span>
          )}
        </div>
        <p className="text-sm text-foreground/90 mt-0.5 break-words">{comment.content}</p>
        <div className="flex items-center gap-3 mt-1">
          {user && !isReply && (
            <button onClick={() => { setReplyTo(comment.id); inputRef.current?.focus(); }}
              className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1">
              <Reply className="w-3 h-3" /> Reply
            </button>
          )}
          {(isAdmin || user?.id === comment.user_id) && (
            <button onClick={() => handleDelete(comment.id)}
              className="text-[11px] text-muted-foreground hover:text-destructive flex items-center gap-1">
              <Trash2 className="w-3 h-3" /> Delete
            </button>
          )}
        </div>
        {/* Replies */}
        {comment.replies?.map(r => renderComment(r, true))}
      </div>
    </motion.div>
  );

  return (
    <div className="mt-6 sm:mt-8">
      <h3 className="font-display text-lg font-bold text-foreground mb-4 flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-primary" />
        Comments
        <span className="text-sm font-normal text-muted-foreground">({comments.length})</span>
      </h3>

      {/* Post comment */}
      {user ? (
        <div className="mb-4 sm:mb-6">
          {replyTo && (
            <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
              <Reply className="w-3 h-3" /> Replying to comment
              <button onClick={() => setReplyTo(null)} className="text-destructive hover:underline">Cancel</button>
            </div>
          )}
          <div className="flex gap-2 sm:gap-3">
            <textarea
              ref={inputRef}
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              maxLength={500}
              rows={2}
              className="flex-1 px-3 py-2 rounded-lg bg-secondary text-foreground text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none min-h-[40px]"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
            />
            <button
              onClick={handleSubmit}
              disabled={posting || !newComment.trim()}
              className="px-3 sm:px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-1.5 self-end"
            >
              {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span className="hidden sm:inline">Post</span>
            </button>
          </div>
          {error && <p className="text-xs text-destructive mt-1">{error}</p>}
          <div className="flex items-center gap-2 mt-1.5">
            <Shield className="w-3 h-3 text-muted-foreground" />
            <p className="text-[10px] text-muted-foreground">Comments are auto-moderated. Bad language is censored.</p>
          </div>
        </div>
      ) : (
        <div className="mb-4 p-3 rounded-lg bg-secondary/50 border border-border text-center">
          <p className="text-sm text-muted-foreground">
            <a href="/login" className="text-primary hover:underline">Login</a> to comment
          </p>
        </div>
      )}

      {/* Comments list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground text-sm">
          No comments yet. Be the first! 💬
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {displayComments.map(c => renderComment(c))}
          </AnimatePresence>
          {comments.length > 5 && !showAll && (
            <button onClick={() => setShowAll(true)}
              className="flex items-center gap-1.5 mx-auto text-sm text-primary hover:underline">
              <ChevronDown className="w-4 h-4" /> Show all {comments.length} comments
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
