/**
 * The padded box a phone importer's fold sits in (song and scripture editors
 * alike): tight around the title row while shut, roomier under the open body.
 * Desktop keeps its plain `p-4`.
 */
export function phoneFoldBoxClass(phone: boolean, open: boolean): string {
  return phone ? `px-4 transition-[padding] duration-200 ${open ? "pb-4 pt-1" : "py-1"}` : "p-4";
}
