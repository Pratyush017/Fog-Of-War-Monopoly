import {
  type LucideIcon
} from "lucide-react";

export const PROPERTY_ICONS: Record<string, LucideIcon> = {};

export function getPropertyPlaceholderUrl(name: string): string {
  // Using placehold.co to generate a background placeholder image.
  // We use a dark color #1e1e1e and an empty text parameter to avoid scaling issues.
  return `https://placehold.co/400x200/1e1e1e/ffffff?text=%20`;
}
