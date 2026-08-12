import { useEffect, useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { isAuthenticated } from "@/lib/auth"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isAuthenticated()) {
      setReady(true)
    } else {
      router.navigate({ href: "/login", replace: true })
    }
  }, [router])

  if (!ready) return null

  return <>{children}</>
}
