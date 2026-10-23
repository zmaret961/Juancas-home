"use client";

import { useEffect, useMemo, useState } from "react";
import { AREAS } from "@/lib/areas";
import type { Listing } from "@/lib/types";
import ListingCard from "./ListingCard";
import QualitySheet from "./QualitySheet";

type Props = { initialListings: Listing[]; updatedAt?: string };
type Tab = "feed" | "favorites";
const CACHE_KEY = "juanca-rental-favorites-v1";

function formatUpdated(date?: string) {
  if (!date) return "Your coastal shortlist";
  return `Updated ${new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date))} PT`;
}

export default function Home({ initialListings, updatedAt }: Props) {
  const [listings, setListings] = useState(initialListings);
  const [favorites, setFavorites] = useState<Listing[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("feed");
  const [selectedArea, setSelectedArea] = useState("all");
  const [minBeds, setMinBeds] = useState(0);
  const [maxPrice, setMaxPrice] = useState(3500);
  const [showQuality, setShowQuality] = useState(false);
  const [updated, setUpdated] = useState(updatedAt);

  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]") as Listing[];
      setFavorites(cached);
    } catch {
      localStorage.removeItem(CACHE_KEY);
    }
    fetch("/api/favorites").then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { favorites?: Listing[]; database?: boolean };
      if (result.database) {
        const value = result.favorites || [];
        localStorage.setItem(CACHE_KEY, JSON.stringify(value));
        setFavorites(value);
      }
    }).catch(() => undefined);
    fetch("/api/listings").then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { listings?: Listing[]; updatedAt?: string };
      if (result.listings?.length) setListings(result.listings);
      if (result.updatedAt) setUpdated(result.updatedAt);
    }).catch(() => undefined);
  }, []);

  const visibleListings = useMemo(() => {
    const feed = activeTab === "favorites" ? favorites : listings;
    return feed
      .filter((listing) => selectedArea === "all" || listing.areaId === selectedArea)
      .filter((listing) => listing.minPrice <= maxPrice)
      .filter((listing) => listing.bedsMax >= minBeds)
      .sort((a, b) => {
        const areaA = AREAS.find((area) => area.id === a.areaId)?.priority ?? 99;
        const areaB = AREAS.find((area) => area.id === b.areaId)?.priority ?? 99;
        return areaA - areaB || Number(b.isNew) - Number(a.isNew) || b.qualityScore - a.qualityScore || a.minPrice - b.minPrice;
      });
  }, [activeTab, favorites, listings, selectedArea, maxPrice, minBeds]);

  function toggleFavorite(listing: Listing) {
    const existing = favorites.some((item) => item.id === listing.id);
    const next = existing ? favorites.filter((item) => item.id !== listing.id) : [{ ...listing }, ...favorites];
    setFavorites(next);
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    if (existing) {
      void fetch(`/api/favorites?id=${encodeURIComponent(listing.id)}`, { method: "DELETE" });
    } else {
      void fetch("/api/favorites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(listing),
      });
    }
  }

  return (
    <main className="min-h-screen pb-28">
      <header className="countdown-bar">
        <div className="countdown-inner">
          <div className="countdown-label">
            <span className="sun-mark" aria-hidden="true">✳</span>
            <div><strong>Move by Fri, Nov 20</strong><span>Good things take a little searching</span></div>
          </div>
          <Countdown />
        </div>
      </header>

      <div className="page-shell">
        <section className="welcome">
          <div className="eyebrow">A place to land in San Diego</div>
          <h1>Home, by the <em>water.</em></h1>
          <p>Thoughtful rental picks for Juanca — starting in Little Italy, with the coast close behind.</p>
          <div className="update-note"><span className="update-dot" />{formatUpdated(updated)} <span className="update-separator">·</span> Curated for $3,500 or less</div>
        </section>

        <div className="section-heading">
          <div>
            <div className="eyebrow">{activeTab === "feed" ? "Your shortlist" : "Saved for later"}</div>
            <h2>{activeTab === "feed" ? "Find your next home" : "Your favorites"}</h2>
          </div>
          <button className="text-button" type="button" onClick={() => setShowQuality(true)}>How we pick <span aria-hidden="true">↗</span></button>
        </div>

        <section className="filters" aria-label="Rental filters">
          <div className="filter-topline"><span className="filter-label">Explore by area</span><span className="result-count">{visibleListings.length} {visibleListings.length === 1 ? "home" : "homes"}</span></div>
          <div className="area-scroll" role="group" aria-label="Filter by area">
            <button className={`area-chip ${selectedArea === "all" ? "selected" : ""}`} onClick={() => setSelectedArea("all")}>All</button>
            {AREAS.map((area) => (
              <button key={area.id} className={`area-chip ${selectedArea === area.id ? "selected" : ""}`} onClick={() => setSelectedArea(area.id)}>{area.shortName}</button>
            ))}
          </div>
          <div className="filter-controls">
            <label className="beds-filter">Bedrooms
              <select value={minBeds} onChange={(event) => setMinBeds(Number(event.target.value))} aria-label="Minimum bedrooms">
                <option value={0}>Any</option><option value={1}>1+</option><option value={2}>2+</option><option value={3}>3+</option>
              </select>
            </label>
            <label className="price-filter">Max rent <strong>${Number(maxPrice).toLocaleString()}</strong>
              <input type="range" min="1500" max="3500" step="100" value={maxPrice} onChange={(event) => setMaxPrice(Number(event.target.value))} aria-label="Maximum monthly rent" />
            </label>
          </div>
        </section>

        {visibleListings.length ? (
          <div className="listing-grid">
            {visibleListings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                favorite={favorites.some((item) => item.id === listing.id)}
                onFavorite={() => toggleFavorite(listing)}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-sun">✳</div>
            <h3>{activeTab === "favorites" ? "Your favorites will feel right at home." : "Nothing quite fits these filters yet."}</h3>
            <p>{activeTab === "favorites" ? "Tap the heart on a home to save it here." : "Try another area or open up your price range."}</p>
            {activeTab === "feed" && <button className="quiet-button" onClick={() => { setSelectedArea("all"); setMaxPrice(3500); setMinBeds(0); }}>Clear filters</button>}
          </div>
        )}
      </div>

      <nav className="tab-bar" aria-label="Main navigation">
        <button className={activeTab === "feed" ? "active" : ""} onClick={() => setActiveTab("feed")} aria-current={activeTab === "feed" ? "page" : undefined}>
          <Icon name="home" /><span>Feed</span>
        </button>
        <button className={activeTab === "favorites" ? "active" : ""} onClick={() => setActiveTab("favorites")} aria-current={activeTab === "favorites" ? "page" : undefined}>
          <span className="tab-icon-wrap"><Icon name="heart" />{favorites.length > 0 && <span className="favorite-count">{favorites.length}</span>}</span><span>Favorites</span>
        </button>
      </nav>
      {showQuality && <QualitySheet onClose={() => setShowQuality(false)} />}
    </main>
  );
}

function Countdown() {
  const getRemaining = () => {
    const now = new Date();
    const targetDate = Date.UTC(2026, 10, 20);
    const targetParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(targetDate)).reduce<Record<string, number>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = Number(part.value);
      return acc;
    }, {});
    const targetOffset = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day, targetParts.hour, targetParts.minute, targetParts.second) - targetDate;
    const target = targetDate - targetOffset;
    return Math.max(0, target - now.getTime());
  };
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const update = () => setRemaining(getRemaining());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return <div className="countdown-units" aria-label={`${days} days, ${hours} hours, ${minutes} minutes and ${seconds} seconds remaining`}>
    <span><b>{days}</b><small>d</small></span><i>:</i><span><b>{String(hours).padStart(2, "0")}</b><small>h</small></span><i>:</i><span><b>{String(minutes).padStart(2, "0")}</b><small>m</small></span><i>:</i><span><b>{String(seconds).padStart(2, "0")}</b><small>s</small></span>
  </div>;
}

function Icon({ name }: { name: "home" | "heart" }) {
  return name === "home" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.5 10 8.5-7 8.5 7v10.5h-6v-7h-5v7h-6z" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5-8.8 11-8.8 11s-8.8-6-8.8-11a4.6 4.6 0 0 1 8.8-1.9 4.6 4.6 0 0 1 8.8 1.9Z" /></svg>
  );
}
