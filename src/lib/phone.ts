/**
 * Normalize a phone number to digits so "(512) 555-0143", "512.555.0143"
 * and "+1 512 555 0143" all match the same customer.
 * Returns null when there are no digits to match on.
 */
export function phoneDigits(input: string | null | undefined): string | null {
  if (!input) return null;
  let digits = input.replace(/\D/g, "");
  // Drop the US country code so +1 and bare 10-digit numbers match.
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits.length > 0 ? digits : null;
}

/**
 * Tidy a typed number for display: "5125550199" → "(512) 555-0199".
 * Anything that isn't a plain US number is kept as typed.
 */
export function formatPhone(input: string): string {
  const typed = input.trim();
  const digits = phoneDigits(typed);
  if (digits?.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits?.length === 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return typed;
}
