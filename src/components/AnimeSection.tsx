import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

interface Props {
  title: string;
  linkTo?: string;
  children: ReactNode;
  extra?: ReactNode;
}

export default function AnimeSection({ title, linkTo, children, extra }: Props) {
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl font-bold text-foreground">{title}</h2>
        <div className="flex items-center gap-3">
          {extra}
          {linkTo && (
            <Link to={linkTo} className="flex items-center gap-1 text-sm text-primary hover:underline">
              View all <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}
