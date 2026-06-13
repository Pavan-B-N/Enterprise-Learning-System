import type { CSSProperties, ReactNode } from 'react';

/**
 * Low-level shimmer block. Use it directly for one-off shapes, or compose
 * via the higher-level skeletons below.
 */
export function Skeleton({
  width,
  height,
  radius = 6,
  style,
  className = '',
}: {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton-shimmer ${className}`}
      style={{
        display: 'block',
        width: width ?? '100%',
        height: height ?? '1em',
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

/** A line of fake text. `widths` controls per-line widths (e.g. ['90%','60%']). */
export function SkeletonLines({
  count = 3,
  widths,
  height = 12,
  gap = 8,
}: {
  count?: number;
  widths?: (number | string)[];
  height?: number;
  gap?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }} aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} width={widths?.[i] ?? `${Math.max(40, 95 - i * 10)}%`} height={height} />
      ))}
    </div>
  );
}

/** A card-shaped skeleton — title + text lines + optional footer row. */
export function SkeletonCard({
  lines = 3,
  showFooter = false,
  padding = '1.25rem',
  height,
}: {
  lines?: number;
  showFooter?: boolean;
  padding?: string;
  height?: number | string;
}) {
  return (
    <div
      className="card"
      style={{ padding, height, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}
      aria-busy="true"
    >
      <Skeleton width="55%" height={16} />
      <SkeletonLines count={lines} />
      {showFooter && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '0.75rem' }}>
          <Skeleton width={80} height={12} />
          <Skeleton width={60} height={12} />
        </div>
      )}
    </div>
  );
}

/** A grid of card skeletons. */
export function SkeletonGrid({
  count = 6,
  minCardWidth = 280,
  gap = '1rem',
  cardProps,
}: {
  count?: number;
  minCardWidth?: number;
  gap?: string;
  cardProps?: Parameters<typeof SkeletonCard>[0];
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minCardWidth}px, 1fr))`,
        gap,
      }}
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} {...cardProps} />
      ))}
    </div>
  );
}

/** Avatar / circular skeleton. */
export function SkeletonCircle({ size = 40 }: { size?: number }) {
  return <Skeleton width={size} height={size} radius="50%" />;
}

/** Page-level skeleton wrapper: title + subtitle + body slot. */
export function SkeletonPage({
  showHeader = true,
  children,
}: {
  showHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <div aria-busy="true">
      {showHeader && (
        <div style={{ marginBottom: '1.5rem' }}>
          <Skeleton width="35%" height={26} />
          <div style={{ height: 8 }} />
          <Skeleton width="55%" height={14} />
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Shape-specific skeletons ─────────────────────────────────────────────
// These mirror the real DOM/CSS class structure of the corresponding cards
// so the loading state matches the final layout exactly. Use these instead
// of the generic SkeletonCard so the skeleton no longer "morphs" when data
// arrives.

/** Skeleton matching `.stat-card` (icon block + value + label). */
export function SkeletonStatCard() {
  return (
    <div className="stat-card" aria-busy="true">
      <Skeleton width={36} height={36} radius={10} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <Skeleton width="55%" height={22} />
        <Skeleton width="70%" height={11} />
      </div>
    </div>
  );
}

/** A grid of `.stat-card` skeletons. Reuses the existing `.stats-grid` CSS. */
export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="stats-grid" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonStatCard key={i} />
      ))}
    </div>
  );
}

/** Skeleton matching `.course-card` (badge + title + cert code + meta + module list). */
export function SkeletonCourseCard() {
  return (
    <div className="course-card" aria-busy="true">
      <div className="course-card-header">
        <Skeleton width={60} height={18} radius={10} />
        <Skeleton width={50} height={11} />
      </div>
      <Skeleton width="80%" height={16} style={{ marginBottom: 6 }} />
      <Skeleton width="40%" height={11} style={{ marginBottom: 12 }} />
      <div className="course-card-meta" style={{ marginBottom: '0.75rem' }}>
        <Skeleton width={60} height={11} />
        <Skeleton width={70} height={11} />
      </div>
      <div className="course-card-modules">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="course-card-module-item">
            <Skeleton width={18} height={18} radius="50%" />
            <Skeleton width={`${70 - i * 10}%`} height={11} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Grid of `.course-card` skeletons. Reuses `.course-card-grid` CSS. */
export function SkeletonCourseGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="course-card-grid" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCourseCard key={i} />
      ))}
    </div>
  );
}

/** Skeleton matching `.cert-card` (level badge + title + id + meta + actions). */
export function SkeletonCertCard() {
  return (
    <div className="cert-card" aria-busy="true">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Skeleton width="70%" height={15} />
        <Skeleton width="35%" height={11} />
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <Skeleton width={70} height={11} />
          <Skeleton width={60} height={11} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Skeleton width={80} height={26} radius={6} />
          <Skeleton width={60} height={26} radius={6} />
        </div>
      </div>
    </div>
  );
}

export function SkeletonCertGrid({ count = 6 }: { count?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '1rem',
      }}
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCertCard key={i} />
      ))}
    </div>
  );
}

/** Rows for a `.data-table`. Render inside an existing <tbody>. */
export function SkeletonTableRows({
  rows = 5,
  cols = 3,
  colWidths,
}: {
  rows?: number;
  cols?: number;
  colWidths?: (number | string)[];
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} aria-busy="true">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c}>
              <Skeleton width={colWidths?.[c] ?? `${Math.max(40, 80 - c * 10)}%`} height={11} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/**
 * Sidebar list skeleton — used for the course-detail module/topic outline,
 * conversation list, etc. Renders `groups` collapsible blocks each with
 * `topicsPerGroup` indented rows.
 */
export function SkeletonSidebarList({
  groups = 3,
  topicsPerGroup = 2,
}: {
  groups?: number;
  topicsPerGroup?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} aria-busy="true">
      {Array.from({ length: groups }).map((_, g) => (
        <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton width="70%" height={12} />
          <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: topicsPerGroup }).map((_, t) => (
              <Skeleton key={t} width={`${70 - t * 8}%`} height={10} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
