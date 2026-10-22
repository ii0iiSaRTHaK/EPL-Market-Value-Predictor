// Generated from verified registered source. Do not edit.
import { useMemo } from 'react';
import { LandingPageFrame, type LandingPageProps } from '../src/shaders/landing-pages/LandingPageFrame';
import { splitTypographyProps, usePageTypography, type PageTypographyProps } from '../src/shaders/landing-pages/pageTypography';
import { SYLVA_TYPOGRAPHY } from '../src/shaders/landing-pages/pageRecipes';
export const SYLVA_HERO_VARIANTS = ["living-green", "sakura-sunset", "maple-autumn", "sequoia-mist"] as const;
type SylvaHeroVariant = (typeof SYLVA_HERO_VARIANTS)[number];
type SylvaHeroProps = LandingPageProps & PageTypographyProps & { variant?: 'living-green' };
const SYLVA_HERO_BASE_URL = "/landing-pages/inner-green-3d.html";
const SYLVA_HERO_TITLES: Record<SylvaHeroVariant, string> = {
  "living-green": "Sylva — Into the living world",
  "sakura-sunset": "Sylva — Sakura Sunset",
  "maple-autumn": "Sylva — Maple Autumn",
  "sequoia-mist": "Sylva — Sequoia Mist",
};


function buildSylvaHeroDocument(variant: string): never { throw new Error('Only the requested Living Green variant is vendored: ' + variant); }
export function SylvaHero({ variant = "living-green", ...props }: SylvaHeroProps) {
  const safeVariant = SYLVA_HERO_VARIANTS.includes(variant) ? variant : "living-green";
  const [type, frame] = splitTypographyProps(props);
  const customization = usePageTypography(SYLVA_TYPOGRAPHY, type);
  const srcDoc = useMemo(
    () => (safeVariant === "living-green" ? undefined : buildSylvaHeroDocument(safeVariant)),
    [safeVariant],
  );

  return (
    <LandingPageFrame
      {...frame}
      key={safeVariant}
      customization={customization}
      title={SYLVA_HERO_TITLES[safeVariant]}
      sourceUrl={SYLVA_HERO_BASE_URL}
      srcDoc={srcDoc}
    />
  );
}
