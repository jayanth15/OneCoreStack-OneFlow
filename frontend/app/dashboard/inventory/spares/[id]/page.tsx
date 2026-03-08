"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** The per-category detail page is no longer needed.
 *  Items are now shown inline in the expandable table on /spares. */
export default function RedirectToSpares() {
  const router = useRouter();
  useEffect(() => { router.replace("/dashboard/inventory/spares"); }, [router]);
  return null;
}
