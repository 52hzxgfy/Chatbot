import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function extractTimeRange(prompt: string): { start: string; end: string; } | undefined {
  const timePattern = /(\d{2}:\d{2})\s*(?:to|-)\s*(\d{2}:\d{2})/i;
  const match = prompt.match(timePattern);
  
  if (match) {
    return {
      start: match[1],
      end: match[2]
    };
  }
  
  return undefined;
}
