import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductImage } from "@/components/store/ProductImage";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

type VideoInfo = {
  kind: "youtube" | "vimeo" | "file";
  embedUrl: string;
  contentUrl: string;
  thumbnailUrl?: string;
};
export type ProductMediaItem =
  { type: "image"; src: string } | { type: "video"; src: string; info: VideoInfo };

type Props = {
  media: ProductMediaItem[];
  productName: string;
  discount?: number;
  bestSeller?: boolean;
  country?: string | null;
  flagUrl?: string | null;
};

function MediaSlide({
  item,
  productName,
  priority,
  className,
}: {
  item: ProductMediaItem;
  productName: string;
  priority?: boolean;
  className?: string;
}) {
  if (item.type === "video") {
    if (item.info.kind === "file") {
      return (
        <div className="absolute inset-0 flex items-center justify-center">
          <video
            src={item.info.contentUrl}
            controls
            className={className ?? "h-full w-full max-h-full max-w-full object-contain"}
          />
        </div>
      );
    }
    return (
      <div className="absolute inset-0">
        <iframe
          src={item.info.embedUrl}
          title={productName}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className={className ?? "h-full w-full"}
        />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex min-h-0 min-w-0 items-center justify-center p-4 sm:p-8">
      <ProductImage
        src={item.src}
        alt={productName}
        displaySize={480}
        priority={priority}
        sizes="(max-width: 1024px) 100vw, 480px"
        className={className ?? "h-full w-full max-h-full max-w-full object-contain"}
      />
    </div>
  );
}

function GalleryBadges({ discount, bestSeller }: { discount?: number; bestSeller?: boolean }) {
  return (
    <>
      {discount != null && discount > 0 && (
        <span className="absolute left-4 top-4 z-10 rounded-sm bg-[color:var(--sale)] px-3 py-1 text-xs font-bold text-[color:var(--sale-foreground)]">
          -{discount}%
        </span>
      )}
      {bestSeller && (
        <span className="absolute right-4 top-4 z-10 rounded-sm bg-[color:var(--sale)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[color:var(--sale-foreground)]">
          Mais Vendido
        </span>
      )}
    </>
  );
}

function CountryFlag({ flagUrl, country }: { flagUrl?: string | null; country?: string | null }) {
  if (!flagUrl) return null;
  return (
    <img
      src={flagUrl}
      alt={country ?? ""}
      title={country ?? ""}
      className="absolute bottom-4 left-4 z-10 h-12 w-12 rounded-full border border-background object-cover"
    />
  );
}

/** Carrossel swipeável no mobile; no desktop usa índice controlado pelo pai. */
export function ProductMediaMobileCarousel({
  media,
  productName,
  discount,
  bestSeller,
  country,
  flagUrl,
}: Props) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  if (media.length === 0) return null;

  return (
    <div className="lg:hidden">
      <Carousel
        setApi={setApi}
        opts={{ align: "center", loop: media.length > 1 }}
        className="w-full"
      >
        <div className="relative">
          <CarouselContent className="-ml-0">
            {media.map((item, i) => (
              <CarouselItem key={i} className="pl-0">
                <div className="relative aspect-square w-full max-w-full overflow-hidden bg-card">
                  <GalleryBadges discount={discount} bestSeller={bestSeller} />
                  <MediaSlide item={item} productName={productName} priority={i === 0} />
                  <CountryFlag flagUrl={flagUrl} country={country} />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          {media.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => api?.scrollPrev()}
                className="absolute left-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground"
                aria-label="Imagem anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => api?.scrollNext()}
                className="absolute right-2 top-1/2 z-20 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-background/90 text-foreground"
                aria-label="Próxima imagem"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </Carousel>
      {media.length > 1 && (
        <div className="mt-3 flex justify-center gap-2">
          {media.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir para imagem ${i + 1}`}
              onClick={() => api?.scrollTo(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === current ? "w-6 bg-primary" : "w-2 bg-border",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ProductMediaDesktopMain({
  item,
  productName,
  discount,
  bestSeller,
  flagUrl,
  country,
}: {
  item: ProductMediaItem | undefined;
  productName: string;
  discount?: number;
  bestSeller?: boolean;
  flagUrl?: string | null;
  country?: string | null;
}) {
  return (
    <div className="hidden lg:block">
      <div className="relative aspect-square w-full max-w-full overflow-hidden bg-card">
        <GalleryBadges discount={discount} bestSeller={bestSeller} />
        {item ? <MediaSlide item={item} productName={productName} priority /> : null}
        <CountryFlag flagUrl={flagUrl} country={country} />
      </div>
    </div>
  );
}
