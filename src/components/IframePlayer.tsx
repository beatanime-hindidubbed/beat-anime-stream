interface Props {
  src: string;
}

export default function IframePlayer({ src }: Props) {
  return (
    <div className="relative w-full aspect-video bg-background rounded-lg overflow-hidden">
      <iframe
        src={src}
        className="w-full h-full border-0"
        allowFullScreen
        allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
