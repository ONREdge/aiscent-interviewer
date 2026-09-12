/**
 * Frontend camp catalog for the AISCENT AI Interviewer (Tier 1).
 *
 * This mirrors the ORDER + DISPLAY NAMES exported by the Python module at
 * terraform/aiscent_camps.py — nothing here does any scoring or rubric work.
 * The stepper uses this list to render the six camp labels; the Ascent
 * Position view uses the same list to order the camp snapshot rows.
 */

export type AiscentCampId = 'A' | 'I' | 'S' | 'C' | 'E' | 'N';

export interface AiscentCamp {
  id: AiscentCampId;
  displayName: string;
  fullName: string;
  blurb: string;
}

export const AISCENT_CAMPS: AiscentCamp[] = [
  {
    id: 'A',
    displayName: 'Leadership',
    fullName: 'Aligned Leadership',
    blurb: 'Executive ownership, governance, and how CX priorities show up in decisions.',
  },
  {
    id: 'I',
    displayName: 'Operations',
    fullName: 'Integrated Operations',
    blurb: 'Your journey map — how it was built, and how the rest is anchored to it.',
  },
  {
    id: 'S',
    displayName: 'Signal',
    fullName: 'Signal Intelligence',
    blurb: 'How you listen to customers — sources, connection, and journey anchoring.',
  },
  {
    id: 'C',
    displayName: 'Health',
    fullName: 'Customer Health',
    blurb: 'Seeing customer risk forming before the customer signals it.',
  },
  {
    id: 'E',
    displayName: 'Experience Mgmt',
    fullName: 'Experience Management',
    blurb: 'Spotting systemic patterns and closing the outer loop.',
  },
  {
    id: 'N',
    displayName: 'Navigation',
    fullName: 'Navigation Engine',
    blurb: 'Proactively intervening across journeys at scale.',
  },
];

export const AISCENT_CAMP_ORDER: AiscentCampId[] = AISCENT_CAMPS.map((c) => c.id);

export function getCampIndex(id: AiscentCampId | null): number {
  if (!id) return -1;
  return AISCENT_CAMP_ORDER.indexOf(id);
}

export function nextCampId(id: AiscentCampId | null): AiscentCampId | null {
  if (!id) return AISCENT_CAMP_ORDER[0];
  const idx = getCampIndex(id);
  if (idx < 0 || idx >= AISCENT_CAMP_ORDER.length - 1) return null;
  return AISCENT_CAMP_ORDER[idx + 1];
}

export interface AscentSnapshotRow {
  camp_id: AiscentCampId | string;
  area: string;
  level: string; // "L1" .. "L5" or "—"
  level_number: number | null;
  descriptor: string;
  quote: string;
  capped_by?: string | null;
}

export interface AscentPosition {
  summary: string;
  camp_snapshot: AscentSnapshotRow[];
  what_this_means: string;
  cta: string;
}
