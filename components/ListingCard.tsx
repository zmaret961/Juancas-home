"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { Listing } from "@/lib/types";

function displayFeedName(feed: string): string {
  const name = feed.trim();
  const knownNames: Record<string, string> = {
    ZILLOW: "Zillow",
    LOVELY: "Lovely",
    MLS: "MLS",
    CRMLS: "CRMLS",
    REDFIN: "Redfin",
  };
  return knownNames[name.toUpperCase()] ||
    name.toLowerCase().replace(/[_-]+/g, " ").replace(/(^|\s)[a-z]/g, (letter) => letter.toUpperCase());
}

export default function ListingCard({
  listing,
  favorite,
  onFavorite,
}: {
  listing: Listing;
  favorite: boolean;
  onFavorite: () => void;
}) {
  const carousel = useRef<HTMLDivElement>(null);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [failedPhotoIndexes, setFailedPhotoIndexes] = useState<number[]>([]);
  const [expanded, setExpanded] = useState(false);
  const visiblePhotos = listing.photos
    .map((photo, index) => ({ photo, index }))
    .filter(({ index }) => !failedPhotoIndexes.includes(index));
  const photoCount = visiblePhotos.length;
  const photoSlides = photoCount > 0 ? visiblePhotos : [{ photo: "/placeholder-home.svg", index: -1 }];
  const dotCount = Math.min(7, photoCount);
  const dotStart = Math.min(Math.max(0, photoIndex - 3), Math.max(0, photoCount - dotCount));
  const photoDotIndexes = Array.from({ length: dotCount }, (_, index) => dotStart + index);
  const previousPhotoCount = useRef(photoCount);
  const price = listing.minPrice === listing.maxPrice
    ? `$${listing.minPrice.toLocaleString()}`
    : listing.maxPrice > 3500
      ? `From $${listing.minPrice.toLocaleString()}`
      : `$${listing.minPrice.toLocaleString()}–$${listing.maxPrice.toLocaleString()}`;

  useLayoutEffect(() => {
    if (photoCount < previousPhotoCount.current) {
      const element = carousel.current;
      if (element) element.scrollTo({ left: photoIndex * (element.clientWidth || 1), behavior: "auto" });
    }
    previousPhotoCount.current = photoCount;
  }, [photoCount, photoIndex]);

  function movePhoto(direction: number) {
    const nextIndex = Math.max(0, Math.min(photoCount - 1, photoIndex + direction));
    carousel.current?.scrollTo({ left: nextIndex * (carousel.current.clientWidth || 1), behavior: "smooth" });
    setPhotoIndex(nextIndex);
  }

  function hideBrokenPhoto(index: number) {
    setFailedPhotoIndexes((failed) => failed.includes(index) ? failed : [...failed, index]);
    setPhotoIndex((current) => {
      if (index < current) return current - 1;
      if (index === current) return Math.min(current, Math.max(0, photoCount - 2));
      return current;
    });
  }

  return (
    <article className="listing-card">
      <div className="photo-frame">
        <div
          className="photo-track"
          ref={carousel}
          onScroll={(event) => {
            const element = event.currentTarget;
            setPhotoIndex(Math.round(element.scrollLeft / Math.max(element.clientWidth, 1)));
          }}
          aria-label={`${listing.name} photos`}
        >
          {photoSlides.map(({ photo, index }, slideIndex) => (
            <div className="photo-slide" key={`${photo}-${index}`}>
              <img
                src={photo}
                loading="lazy"
                alt={index === -1 ? `${listing.name} photo unavailable` : `${listing.name}, photo ${slideIndex + 1}`}
                onError={() => {
                  if (index !== -1) hideBrokenPhoto(index);
                }}
              />
            </div>
          ))}
        </div>
        <div className="photo-badges">
          {listing.isNew && <span className="badge new-badge">NEW</span>}
          {listing.priceDrop && <span className="badge drop-badge">Price drop</span>}
        </div>
        <button className={`heart-button ${favorite ? "is-favorite" : ""}`} onClick={onFavorite} aria-label={favorite ? "Remove from favorites" : "Save to favorites"} aria-pressed={favorite}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5-8.8 11-8.8 11s-8.8-6-8.8-11a4.6 4.6 0 0 1 8.8-1.9 4.6 4.6 0 0 1 8.8 1.9Z" /></svg>
        </button>
        {photoCount > 1 && <>
          <button className="photo-arrow prev" onClick={() => movePhoto(-1)} aria-label="Previous photo" disabled={photoIndex === 0}>‹</button>
          <button className="photo-arrow next" onClick={() => movePhoto(1)} aria-label="Next photo" disabled={photoIndex === photoCount - 1}>›</button>
          <div className="photo-counter">{photoIndex + 1} / {photoCount}</div>
          <div className="photo-dots">{photoDotIndexes.map((index) => <span key={index} className={index === photoIndex ? "active" : ""} />)}</div>
        </>}
      </div>
      <div className="listing-content">
        <div className="listing-kicker"><span>{listing.areaName}</span>{listing.verified && <span className="verified">Verified</span>}</div>
        <div className="title-price"><h3>{listing.name}</h3><div className="price">{price}<small>/mo</small></div></div>
        <p className="address">{listing.address}{listing.city ? `, ${listing.city}` : ""}{listing.zip ? ` ${listing.zip}` : ""}</p>
        <div className="home-stats">
          <span>{listing.bedsMin === 0 ? "Studio" : `${listing.bedsMin}${listing.bedsMax > listing.bedsMin ? `–${listing.bedsMax}` : ""} bed${listing.bedsMax === 1 ? "" : "s"}`}</span>
          <i />
          <span>{listing.bathsMin === listing.bathsMax ? listing.bathsMin : `${listing.bathsMin}–${listing.bathsMax}`} bath</span>
          {listing.sqftMin !== undefined && listing.sqftMin > 0 && <><i /><span>{listing.sqftMin.toLocaleString()}{listing.sqftMax && listing.sqftMax !== listing.sqftMin ? `–${listing.sqftMax.toLocaleString()}` : ""} sqft</span></>}
        </div>
        {listing.amenities.length > 0 && <div className="amenity-row">{listing.amenities.slice(0, 4).map((amenity) => <span className="amenity-chip" key={amenity}>{amenity}</span>)}</div>}
        <button className="details-toggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {expanded ? "Hide details" : "More details"} <span className={expanded ? "turned" : ""}>⌄</span>
        </button>
        {expanded && <div className="expanded-details">
          {listing.description && <p className="description">{listing.description}</p>}
          {listing.floorPlans.length > 0 && <div className="floor-plans">
            <strong>Available floor plans</strong>
            {listing.floorPlans.map((plan, index) => (
              <div className="floor-plan" key={`${plan.beds}-${plan.baths}-${plan.minPrice}-${index}`}>
                <span>{plan.beds === 0 ? "Studio" : `${plan.beds} bed`} · {plan.baths} bath{plan.minSqft ? ` · ${plan.minSqft.toLocaleString()} sqft` : ""}</span>
                <b>${plan.minPrice.toLocaleString()}{plan.maxPrice > 3500 ? "+" : plan.maxPrice > plan.minPrice ? `–$${plan.maxPrice.toLocaleString()}` : ""}</b>
              </div>
            ))}
          </div>}
        </div>}
        <div className="card-footer">
          <span className="source-label">{listing.sources.map((source) => source.feed ? `${source.name} · via ${displayFeedName(source.feed)}` : source.name).join(" + ")}</span>
          {listing.sources[0] && <a href={listing.sources[0].url} target="_blank" rel="noreferrer">View original listing <span aria-hidden="true">↗</span></a>}
        </div>
      </div>
    </article>
  );
}
