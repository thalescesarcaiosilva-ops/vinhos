import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Heart, Play } from "lucide-react";
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

type FavoriteControl = {
  active: boolean;
  onToggle: () => void;
};

type Props = {
  media: ProductMediaItem[];
  productName: string;
  discount?: number;
  bestSeller?: boolean;
  favorite?: FavoriteControl;
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
        sizes="(max-width: 1279px) 100vw, 480px"
        className={className ?? "h-full w-full max-h-full max-w-full object-contain"}
      />
    </div>
  );
}

function GalleryBadges({ discount, bestSeller }: { discount?: number; bestSeller?: boolean }) {
  const hasDiscount = discount != null && discount > 0;
  return (
    <>
      {hasDiscount && (
        <span className="absolute left-4 top-4 z-10 flex h-16 w-16 flex-col items-center justify-center rounded-full bg-[#c6a35a] text-center leading-none text-[#3a2418] shadow-sm">
          <span className="text-sm font-bold">-{discount}%</span>
          <span className="mt-1 text-[10px] font-semibold tracking-[0.08em]">OFF</span>
        </span>
      )}
      {bestSeller && (
        <span
          className={`absolute left-4 z-10 rounded-full bg-[color:var(--sale)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[color:var(--sale-foreground)] ${
            hasDiscount ? "top-24" : "top-4"
          }`}
        >
          Mais vendido
        </span>
      )}
    </>
  );
}

function FavoriteButton({ favorite }: { favorite: FavoriteControl }) {
  return (
    <button
      type="button"
      onClick={favorite.onToggle}
      aria-pressed={favorite.active}
      aria-label={favorite.active ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full bg-background/95 text-foreground shadow-sm ring-1 ring-border/50 transition-colors hover:text-primary"
    >
      <Heart className={`h-5 w-5 ${favorite.active ? "fill-primary text-primary" : ""}`} />
    </button>
  );
}

/** Carrossel swipeável no mobile; no desktop usa índice controlado pelo pai. */
export function ProductMediaMobileCarousel({
  media,
  productName,
  discount,
  bestSeller,
  favorite,
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
    <div className="xl:hidden">
      <Carousel
        setApi={setApi}
        opts={{ align: "center", loop: media.length > 1 }}
        className="w-full"
      >
        <div className="relative">
          <CarouselContent className="-ml-0">
            {media.map((item, i) => (
              <CarouselItem key={i} className="pl-0">
                <div className="relative aspect-square max-h-[52vh] w-full max-w-full overflow-hidden rounded-[1.25rem] bg-white">
                  <GalleryBadges discount={discount} bestSeller={bestSeller} />
                  <MediaSlide item={item} productName={productName} priority={i === 0} />
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
          {favorite && <FavoriteButton favorite={favorite} />}
        </div>
      </Carousel>
      {media.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          {media.map((item, i) => (
            <button
              key={i}
              type="button"
              aria-label={item.type === "video" ? "Ver vídeo do produto" : `Ir para imagem ${i + 1}`}
              onClick={() => api?.scrollTo(i)}
              className={cn(
                "grid place-items-center rounded-full transition-all",
                item.type === "video"
                  ? i === current
                    ? "h-7 w-7 bg-primary text-primary-foreground"
                    : "h-7 w-7 bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2"
                  : i === current
                    ? "h-2 w-6 bg-primary"
                    : "h-2 w-2 bg-border",
              )}
            >
              {item.type === "video" && <Play className="h-3.5 w-3.5 fill-current" aria-hidden />}
            </button>
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
  favorite,
}: {
  item: ProductMediaItem | undefined;
  productName: string;
  discount?: number;
  bestSeller?: boolean;
  favorite?: FavoriteControl;
}) {
  return (
    <div className="hidden xl:block">
      <div className="relative aspect-square w-full max-w-full overflow-hidden rounded-[1.25rem] bg-white">
        <GalleryBadges discount={discount} bestSeller={bestSeller} />
        {item ? <MediaSlide item={item} productName={productName} priority /> : null}
        {favorite && <FavoriteButton favorite={favorite} />}
      </div>
    </div>
  );
}
