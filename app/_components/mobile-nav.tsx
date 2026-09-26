"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, ChevronRight, Menu } from "lucide-react"
import { Button, buttonLink } from "@/src/ui/button"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/src/ui/sheet"

export type NavItem = { label: string; href: string }

/**
 * site-contract.md §3 — below the desktop breakpoint the nav collapses. The
 * primary action travels into the panel so the mobile header cannot overflow
 * at 320px. Every target is at least 48px (§4.4).
 *
 * The panel is controlled rather than using SheetClose for the destinations:
 * SheetClose is a button, and asking it to render an anchor forces button
 * semantics onto something that navigates. Closing on click keeps the links
 * real links.
 */
export function MobileNav({ items }: { items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Menü öffnen"
          />
        }
      >
        <Menu aria-hidden="true" className="size-6" strokeWidth={1.5} />
      </SheetTrigger>

      <SheetContent side="right" closeLabel="Menü schließen" className="w-[min(85vw,20rem)]">
        <SheetHeader>
          <SheetTitle>Menü</SheetTitle>
        </SheetHeader>

        <nav aria-label="Hauptnavigation" className="px-6 sm:px-8">
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.href} className="border-b border-border">
                <Link
                  href={item.href}
                  onClick={close}
                  className="group/row -mx-2 flex min-h-12 items-center justify-between gap-4 rounded-sm px-2 text-subtitle text-grau transition-colors hover:bg-bg-blue focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  {item.label}
                  <ChevronRight
                    aria-hidden="true"
                    className="size-5 shrink-0 text-grau transition-transform group-hover/row:translate-x-0.5"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <SheetFooter>
          <Link
            href="/#leistungen"
            onClick={close}
            className={buttonLink({ className: "w-full" })}
          >
            Jetzt abmelden
            <ArrowRight aria-hidden="true" />
          </Link>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
