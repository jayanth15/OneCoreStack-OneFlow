import { useEffect, useRef, useState } from "react"
import { AlertCircle, X } from "lucide-react"

type AppToast = {
  id: number
  message: string
}

const TOAST_EVENT = "oneflow:notify-error"

export function notifyError(message: string) {
  window.dispatchEvent(new CustomEvent<string>(TOAST_EVENT, { detail: message }))
}

/**
 * Accessible, non-blocking replacement for the migrated application's native
 * alert dialogs. Existing alert call sites are captured here so errors render
 * consistently while each feature is gradually moved to `notifyError`.
 */
export function AppToaster() {
  const [toasts, setToasts] = useState<AppToast[]>([])
  const nextId = useRef(1)

  useEffect(() => {
    const originalAlert = window.alert

    const show = (message: unknown) => {
      const id = nextId.current++
      setToasts((current) => [
        ...current.slice(-2),
        { id, message: String(message || "Something went wrong") },
      ])
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id))
      }, 5_000)
    }

    const onNotify = (event: Event) => show((event as CustomEvent<string>).detail)
    window.alert = show
    window.addEventListener(TOAST_EVENT, onNotify)

    return () => {
      window.alert = originalAlert
      window.removeEventListener(TOAST_EVENT, onNotify)
    }
  }, [])

  return (
    <div
      className="pointer-events-none fixed inset-x-3 bottom-4 z-[100] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:w-[min(24rem,calc(100vw-2rem))] sm:items-stretch"
      aria-live="assertive"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="alert"
          className="pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-destructive/30 bg-background p-3 text-foreground shadow-lg"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-sm leading-5">{toast.message}</p>
          <button
            type="button"
            onClick={() => setToasts((current) => current.filter((item) => item.id !== toast.id))}
            className="-m-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Dismiss error"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  )
}
