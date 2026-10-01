/** The current civil date in Lithuania, independent of the caller's timezone. */
export function todayInVilnius(instant: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Vilnius", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(instant);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
