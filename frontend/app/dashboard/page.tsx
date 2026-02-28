export default function DashboardPage() {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center border-b px-6">
        <h1 className="text-base font-semibold">Dashboard</h1>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <p className="text-muted-foreground text-sm">
          Welcome to OneFlow. Select a module from the sidebar (desktop) or bottom bar (mobile) to get started.
        </p>
      </div>
    </>
  )
}
