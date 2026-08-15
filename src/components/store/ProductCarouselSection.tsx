import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { ProductCard, type Product } from "@/components/store/ProductCard";
import { StoreContainer } from "@/components/store/StoreContainer";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { cn } from "@/lib/utils";

type ProductCarouselSectionProps = {
  title: string;
  subtitle?: string;
  products: Product[];
  collectionSlug?: string;
  linkLabel?: string;
  contained?: boolean;
  className?: string;
};

export function ProductCarouselSection({
  title,
  subtitle,
  products,
  collectionSlug,
  linkLabel = "Ver todos",
  contained = true,
  className,
}: ProductCarouselSectionProps) {
  const content = (
    <>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-[color:var(--section-title)] md:text-3xl lg:text-4xl">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {collectionSlug && (
          <Link
            to="/colecao/$slug"
            params={{ slug: collectionSlug }}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-primary transition-opacity hover:opacity-70"
          >
            {linkLabel}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        )}
      </div>

      <Carousel opts={{ align: "start", loop: products.length > 4 }} className="w-full">
        <CarouselContent>
          {products.map((product) => (
            <CarouselItem key={product.id} className="h-auto basis-1/2 md:basis-1/3 lg:basis-1/4">
              <ProductCard p={product} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className="left-2 hidden border-border/60 bg-background/90 text-foreground shadow-sm hover:bg-background md:flex" />
        <CarouselNext className="right-2 hidden border-border/60 bg-background/90 text-foreground shadow-sm hover:bg-background md:flex" />
      </Carousel>
    </>
  );

  return (
    <section className={cn("py-10 lg:py-12", className)}>
      {contained ? <StoreContainer>{content}</StoreContainer> : content}
    </section>
  );
}
