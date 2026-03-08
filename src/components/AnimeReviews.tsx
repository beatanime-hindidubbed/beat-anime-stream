import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { Star, Send, Trash2, Edit2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Review {
  id: string;
  user_id: string;
  anime_id: string;
  rating: number;
  content: string | null;
  created_at: string;
  username?: string;
}

interface Props {
  animeId: string;
}

export default function AnimeReviews({ animeId }: Props) {
  const { user, isAdmin } = useSupabaseAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadReviews = async () => {
    const { data } = await supabase
      .from("anime_reviews")
      .select("*")
      .eq("anime_id", animeId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) {
      // Enrich with usernames
      const enriched: Review[] = [];
      for (const r of data as any[]) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("user_id", r.user_id)
          .single();
        enriched.push({ ...r, username: profile?.username || "Anonymous" });
      }
      setReviews(enriched);
    }
  };

  useEffect(() => {
    loadReviews();
  }, [animeId]);

  // Check if user already reviewed
  useEffect(() => {
    if (!user) return;
    const existing = reviews.find(r => r.user_id === user.id);
    if (existing) {
      setRating(existing.rating);
      setContent(existing.content || "");
      setEditing(false);
    }
  }, [reviews, user]);

  const userReview = reviews.find(r => r.user_id === user?.id);
  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : "N/A";

  const submitReview = async () => {
    if (!user || rating === 0) return;
    setLoading(true);

    if (userReview) {
      await supabase
        .from("anime_reviews")
        .update({ rating, content: content.trim() || null, updated_at: new Date().toISOString() } as any)
        .eq("id", userReview.id);
    } else {
      await supabase
        .from("anime_reviews")
        .insert({ user_id: user.id, anime_id: animeId, rating, content: content.trim() || null } as any);
    }

    setEditing(false);
    setLoading(false);
    await loadReviews();
  };

  const deleteReview = async (id: string) => {
    await supabase.from("anime_reviews").delete().eq("id", id);
    await loadReviews();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-bold text-foreground flex items-center gap-2">
          <Star className="w-4 h-4 text-accent fill-accent" />
          Reviews ({reviews.length})
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(s => (
              <Star key={s} className={`w-3.5 h-3.5 ${
                parseFloat(avgRating) >= s ? "text-accent fill-accent" : "text-muted-foreground"
              }`} />
            ))}
          </div>
          <span className="text-sm font-bold text-foreground">{avgRating}</span>
        </div>
      </div>

      {/* Write/Edit review */}
      {user && (!userReview || editing) && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-card border border-border space-y-3"
        >
          <p className="text-sm font-medium text-foreground">
            {userReview ? "Edit your review" : "Write a review"}
          </p>

          {/* Star selector */}
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s}
                onMouseEnter={() => setHoverRating(s)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(s)}
                className="p-0.5 transition-transform hover:scale-125"
              >
                <Star className={`w-6 h-6 transition-colors ${
                  (hoverRating || rating) >= s
                    ? "text-accent fill-accent"
                    : "text-muted-foreground"
                }`} />
              </button>
            ))}
            {rating > 0 && (
              <span className="ml-2 text-xs text-muted-foreground">
                {["", "Poor", "Fair", "Good", "Great", "Amazing"][rating]}
              </span>
            )}
          </div>

          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Share your thoughts... (optional)"
            rows={3}
            maxLength={500}
            className="w-full px-3 py-2 rounded-lg bg-secondary text-foreground text-sm border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />

          <div className="flex items-center gap-2">
            <button
              onClick={submitReview}
              disabled={rating === 0 || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              <Send className="w-3.5 h-3.5" />
              {userReview ? "Update" : "Submit"}
            </button>
            {editing && (
              <button onClick={() => setEditing(false)}
                className="flex items-center gap-1 px-3 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm">
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
          </div>
        </motion.div>
      )}

      {/* User's existing review */}
      {user && userReview && !editing && (
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-foreground">Your Review</span>
              <div className="flex">
                {[1, 2, 3, 4, 5].map(s => (
                  <Star key={s} className={`w-3 h-3 ${userReview.rating >= s ? "text-accent fill-accent" : "text-muted-foreground"}`} />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-secondary">
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button onClick={() => deleteReview(userReview.id)} className="p-1 rounded hover:bg-destructive/20">
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </button>
            </div>
          </div>
          {userReview.content && (
            <p className="text-sm text-foreground/80">{userReview.content}</p>
          )}
        </div>
      )}

      {/* Reviews list */}
      <AnimatePresence>
        {reviews
          .filter(r => r.user_id !== user?.id)
          .map(review => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-3 rounded-lg bg-secondary/50 border border-border"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-secondary-foreground">
                    {(review.username || "?")[0]?.toUpperCase()}
                  </div>
                  <span className="text-xs font-medium text-foreground">{review.username}</span>
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={`w-2.5 h-2.5 ${review.rating >= s ? "text-accent fill-accent" : "text-muted-foreground"}`} />
                    ))}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                </div>
                {isAdmin && (
                  <button onClick={() => deleteReview(review.id)} className="p-1 rounded hover:bg-destructive/20">
                    <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                  </button>
                )}
              </div>
              {review.content && (
                <p className="text-sm text-foreground/70 ml-8">{review.content}</p>
              )}
            </motion.div>
          ))}
      </AnimatePresence>

      {reviews.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No reviews yet. Be the first!</p>
      )}
    </div>
  );
}
