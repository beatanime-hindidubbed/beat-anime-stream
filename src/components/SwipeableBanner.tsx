import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { AnimeItem } from "@/lib/api";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { Play, ChevronLeft, ChevronRight, Info } from "lucide-react";

interface Props {
  items: AnimeItem[];
}

export default function SwipeableBanner({ items }: Props) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const current = items[index];

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setDirection(1);
      setIndex((i) => (i + 1) % items.length);
    }, 6000);
  }, [items.length]);


  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [index, resetTimer]);

  const goTo = (dir: number) => {
    setDirection(dir);
    setIndex((i) => (i + dir + items.length) % items.length);
  };

  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < -50) goTo(1);
    else if (info.offset.x > 50) goTo(-1);
  };

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? "100%" : "-100%", opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? "-100%" : "100%", opacity: 0 }),
  };

  return (
    <div className="relative h-[55vh] md:h-[65vh] overflow-hidden mb-10 touch-pan-y">
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={index}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.5, ease: "easeInOut" }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={handleDragEnd}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
        >
          <img
            src={current.poster}
            alt={current.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
          {/* Overlays */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 via-transparent to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 container pb-10 z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 rounded-md bg-primary/20 text-primary text-xs font-semibold">
                #{index + 1} Spotlight
              </span>
              {current.type && (
                <span className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs">
                  {current.type}
                </span>
              )}
              {current.rating && (
                <span className="px-2 py-0.5 rounded-md bg-accent/20 text-accent text-xs font-medium">
                  ⭐ {current.rating}
                </span>
              )}
            </div>
            <h1 className="font-display text-3xl md:text-5xl lg:text-6xl font-bold text-foreground mb-3 max-w-2xl leading-tight">
              {current.name}
            </h1>
            {current.description && (
              <p className="text-sm md:text-base text-muted-foreground max-w-lg line-clamp-2 mb-5">
                {current.description}
              </p>
            )}
            <div className="flex items-center gap-3">
              <Link
                to={`/anime/${current.id}`}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground hover:opacity-90 transition-all shadow-glow"
              >
                <Play className="w-4 h-4" /> Watch Now
              </Link>
              <Link
                to={`/anime/${current.id}`}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-secondary/80 backdrop-blur text-sm font-medium text-secondary-foreground hover:bg-secondary transition-colors"
              >
                <Info className="w-4 h-4" /> Details
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Nav arrows */}
      {items.length > 1 && (
        <>
          <button
            onClick={() => goTo(-1)}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/60 backdrop-blur flex items-center justify-center text-foreground hover:bg-background/80 transition-colors z-10"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => goTo(1)}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background/60 backdrop-blur flex items-center justify-center text-foreground hover:bg-background/80 transition-colors z-10"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}

      {/* Dots */}
      {items.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
          {items.slice(0, 8).map((_, i) => (
            <button
              key={i}
              onClick={() => { setDirection(i > index ? 1 : -1); setIndex(i); }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
