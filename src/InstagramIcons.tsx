import { createElement, type SVGProps } from 'react';
import glyphs from './instagram-icons.json';
type Props = Omit<SVGProps<SVGSVGElement>, 'ref'> & { size?: number; filled?: boolean };
type Name = keyof typeof glyphs;
function glyph(outline: Name, solid?: Name, canvas = 24) {
  return function InstagramIcon({ size = 24, filled = false, fill, className = '', ...props }: Props) {
    const nodes = glyphs[(filled || (fill && fill !== 'none')) && solid ? solid : outline];
    return <svg {...props} width={size} height={size} viewBox={`0 0 ${canvas} ${canvas}`} fill="currentColor" className={'instagram-icon ' + className} aria-hidden="true">{nodes.map((node, key) => createElement(node.tag, { ...node.attrs, key }))}</svg>;
  };
}
export const Home = glyph("IGDSHomePrismOutlineIcon", "IGDSHomePrismFilledIcon");
export const Clapperboard = glyph("IGDSReelsPrismOutlineIcon", "IGDSReelsPrismFilledIcon");
export const Heart = glyph("IGDSHeartPanoOutlineIcon", "IGDSHeartPanoFilledIcon");
export const Bookmark = glyph("IGDSSavePanoOutlineIcon", "IGDSSavePanoFilledIcon");
export const Search = glyph("IGDSSearchPanoOutlineIcon");
export const Send = glyph("IGDSDirectPrismOutline24Icon");
export const MessageCircle = glyph("IGDSCommentPanoOutlineIcon");
export const MoreHorizontal = glyph("IGDSMoreHorizontalFilledIcon");
export const Menu = glyph("IGDSMenuPanoOutlineIcon");
export const Repeat2 = glyph("IGDSRepostBubbleIcon");
export const Play = glyph("IGDSPlayPrismFilled24Icon");
export const Pause = glyph("IGDSWebPauseFilledIcon", undefined, 48);
export const Volume2 = glyph("IGDSVolumeOnFilledIcon");
export const VolumeX = glyph("IGDSVolumeOffFilledIcon", undefined, 48);
export const X = glyph("IGDSXPanoOutlineIcon");
export const Grid3X3 = glyph("IGDSPhotoGridPanoOutlineIcon");
export const ChevronLeft = glyph("IGDSChevronLeftPanoOutlineIcon");
export const ChevronRight = glyph("IGDSChevronRightPanoOutlineIcon");
export const Verified = glyph("IGDSVerifiedIcon", undefined, 40);
