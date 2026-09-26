/** Global quick-find results (name, mobile, email or reference number). */
export interface SearchResults {
  customers: { id: string; refNo: string; fullName: string; phone: string }[];
  leads: { id: string; refNo: string; contactName: string; phone: string; stage: string }[];
  bookings: { id: string; refNo: string; status: string; customerName: string }[];
}
