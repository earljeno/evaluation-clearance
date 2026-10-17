# Design Direction: NDMU Survey Clearance System

## 1. Identity & Purpose
- **Product**: Survey Clearance Verification Desk
- **Institution**: Notre Dame of Marbel University (NDMU), Computer Science Center
- **Audience**: University laboratory staff, student assistants, and faculty verifying clearance during evaluation week
- **Personality**: Institutional, trustworthy, efficient, collegiate, focused academic utility

## 2. Dials
- **ENERGY: 1 (Calm)**: Uncluttered focus tool for rapid ID scanning and clearance verification
- **RHYTHM: 1 (Uniform & Predictable)**: Clear single-console layout with consistent hierarchy: Brand identity -> Input console -> Status stage -> Sync status
- **MOTION: 1 (Restrained)**: Fast, functional transitions (150ms-200ms) for search state updates; no looping or distracting animations

## 3. Color Palette
- **Primary Brand (Deep Forest)**: `#164e3b` (NDMU collegiate green for headings, brand bar, primary action button)
- **Primary Brand Dark**: `#0f392b` (hover and focus ring accents)
- **Collegiate Gold / Accent**: `#d97706` (NDMU gold for institutional crest highlight, focus border)
- **Neutral Background**: `#f4f6f4` (soft warm stone neutral, avoids clinical glare)
- **Card Surface**: `#ffffff` (crisp white card container with subtle 1px border `#e2e8f0`)
- **Text Primary**: `#0f172a` (high contrast charcoal on light surfaces, WCAG AAA compliant 14:1+)
- **Text Muted**: `#475569` (medium slate for secondary labels and instructions, WCAG AA compliant 5.5:1+)
- **Status Cleared (Success)**: `#047857` text on `#ecfdf5` background with `#a7f3d0` border
- **Status Not Found (Notice)**: `#b45309` text on `#fffbeb` background with `#fde68a` border
- **Status Error**: `#b91c1c` text on `#fef2f2` background with `#fecaca` border

## 4. Typography
- **Primary Font**: `Plus Jakarta Sans`, sans-serif (clean modern grotesque with high legibility at all sizes)
- **Monospace / Tabular IDs**: `'JetBrains Mono'`, `ui-monospace`, monospace (for School ID numbers and clearance timestamps)
- **Scale**:
  - Main Title: 1.5rem (24px), bold (700)
  - Subtitle: 0.875rem (14px), medium (500)
  - Search Input: 1.125rem (18px), regular (400)
  - Result Name: 1.375rem (22px), bold (700)
  - Result Badge: 1rem (16px), semibold (600)

## 5. Layout & Components
- **Focal Point**: The central search input field with autofocus, clean icon indicator, and clear button
- **NDMU Brand Emblem**: Displaying `static/ndmu_logo.png` neatly alongside the Center title
- **Status Card**: Clear three-state presentation (idle instructions, searching spinner, verified result with distinct Cleared vs Not Found styling)
- **Utility Actions**:
  - Search action button with accessible label
  - Data Sync button with live countdown/cooldown and status indicator
  - Quick link to Dual-Screen Guest Viewer (`/viewer`)
- **Accessibility & Resilience**:
  - High contrast WCAG AA compliant across all text
  - Keyboard navigable (`Tab`, `Enter` to search, `Escape` to clear)
  - Prominent focus rings (`outline: 2px solid #164e3b; outline-offset: 2px;`)
  - Full mobile responsiveness with minimum 44px tap targets
