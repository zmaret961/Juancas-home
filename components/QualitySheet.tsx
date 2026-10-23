"use client";

export default function QualitySheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="quality-sheet" role="dialog" aria-modal="true" aria-labelledby="quality-title" onClick={(event) => event.stopPropagation()}>
        <button className="sheet-close" onClick={onClose} aria-label="Close how-we-pick sheet">×</button>
        <span className="eyebrow">A little less scrolling</span>
        <h2 id="quality-title">How listings are picked</h2>
        <p>We keep the shortlist focused on homes with enough detail to make an informed first look.</p>
        <ul>
          <li><b>Good basics:</b> apartments and condos only, with a floor plan at or below $3,500, at least six photos, and known beds and baths.</li>
          <li><b>Enough to picture it:</b> a 150-character description, or six highlighted amenities when the source doesn’t provide a description.</li>
          <li><b>Extra points:</b> more photos, square footage, four or more amenities, verified listings, and useful features like laundry, parking, A/C, or a balcony.</li>
          <li><b>Coastal by design:</b> Little Italy comes first. Other areas use tight coastal map bounds so inland listings stay out.</li>
        </ul>
        <p className="sheet-footnote">Listings are gathered from Rent.com and may change at any time. Always confirm availability, pricing, and terms with the property.</p>
        <button className="sheet-done" onClick={onClose}>Got it</button>
      </section>
    </div>
  );
}
