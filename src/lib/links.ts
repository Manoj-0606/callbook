/** Page addresses, in one place. */

export function jobHref(jobId: number): string {
  return `/jobs/${jobId}`;
}

export function customerHref(customerId: number): string {
  return `/customers/${customerId}`;
}
